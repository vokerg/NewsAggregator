"""Fail-closed, deterministic metadata-only static read-model publisher.

Input is the collector's *public* NDJSON archive, never its local research tree.
No network access, no article body capture, no automatic GitHub writes.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
from uuid import uuid4

from .models import ValidationError, load_registry
from .runtime import validate_public_item

PAGE_SIZE = 100
MAX_ITEMS = 100_000
MAX_PAGES = 2_000
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def _public_item(row: dict, sources: dict) -> dict:
    validate_public_item(row)
    sid = row["source_id"]
    if sid not in sources:
        raise ValidationError("item source missing from registry")
    source = sources[sid]
    if source.rights_profile == "local_only":
        raise ValidationError("local-only source cannot be published")
    if not SAFE_ID.fullmatch(row["item_id"]):
        raise ValidationError("unsafe item ID")
    # Historical perspective is captured on the item; never recalculate it
    # from current source configuration or the event's country.
    item = {
        "id": row["item_id"],
        "title": row["headline"],
        "source_id": sid,
        "source_name": source.display_name,
        "original_url": row["original_url"],
        "published_at": row["published_at"],
        "first_seen_at": row["first_seen_at"],
        "perspective_ids": row["perspective_ids_at_capture"],
        "about_country_codes": row["about_country_codes"],
        "language": row["language"],
        "editorial_labels": row["editorial_labels_at_capture"],
        "extraction_status": {
            "extracted": "extracted",
            "failed": "failed",
            "unavailable": "unavailable",
            "not_requested": "not_requested",
        }[row["body_extraction_status"]],
    }
    if row["publisher_country"] is not None:
        item["publisher_country"] = row["publisher_country"]
    return item


def _load_rows(path: Path, sources: dict) -> list[dict]:
    if not path.is_file():
        raise ValidationError("collector public archive is missing")
    rows: list[dict] = []
    seen: set[str] = set()
    with path.open(encoding="utf-8") as stream:
        for number, line in enumerate(stream, 1):
            if number > MAX_ITEMS:
                raise ValidationError("archive exceeds publisher item bound")
            if not line.strip():
                raise ValidationError("blank NDJSON row")
            row = json.loads(line)
            item = _public_item(row, sources)
            if item["id"] in seen:
                raise ValidationError("duplicate item ID")
            seen.add(item["id"])
            rows.append(item)
    rows.sort(key=lambda item: (item["published_at"] or item["first_seen_at"], item["id"]), reverse=True)
    return rows


def _write(root: Path, path: str, value: object) -> None:
    destination = root / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(_json(value), encoding="utf-8")


def publish(archive: Path, registry: Path, output: Path) -> dict:
    """Generate a full, independently validated projection or leave output unchanged."""
    _, configured = load_registry(registry)
    sources = {s.source_id: s for s in configured}
    items = _load_rows(archive, sources)
    by_day: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        by_day[(item["published_at"] or item["first_seen_at"])[:10]].append(item)
    # Revision is content-addressed, not a wall-clock publishing timestamp.
    payload = _json(items).encode("utf-8")
    revision = "data-" + hashlib.sha256(payload).hexdigest()[:24]
    pages: list[dict] = []
    for day in sorted(by_day, reverse=True):
        for offset in range(0, len(by_day[day]), PAGE_SIZE):
            pages.append({"day": day, "part": offset // PAGE_SIZE + 1,
                          "count": min(PAGE_SIZE, len(by_day[day]) - offset)})
    if len(pages) > MAX_PAGES:
        raise ValidationError("archive exceeds maximum page count")
    manifest = {"schema_version": 2, "revision": revision, "total_items": len(items), "pages": pages}

    # All files are assembled outside the destination; validation failure
    # cannot publish a partially projected page or a restricted body.
    if output.is_symlink():
        raise ValidationError("unsafe output symlink")
    output = output.resolve()
    if (output == Path(output.anchor) or archive.resolve().is_relative_to(output)
            or registry.resolve().is_relative_to(output)):
        raise ValidationError("unsafe output location")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".catalog-stage-", dir=output.parent) as stage:
        root = Path(stage) / "catalog"
        root.mkdir()
        _write(root, "manifest.json", manifest)
        for page in pages:
            day, part = page["day"], page["part"]
            offset = (part - 1) * PAGE_SIZE
            _write(root, f"days/{day}/{part}.json",
                   {"schema_version": 1, "revision": revision,
                    "items": by_day[day][offset:offset + PAGE_SIZE]})
        for item in items:
            _write(root, f"metadata/{item['id']}.json",
                   {"schema_version": 1, "revision": revision, "items": [item]})
            # A successfully extracted body is still not licensed for public use.
            status = item["extraction_status"]
            reason = ("rights" if status == "extracted" else "failed" if status == "failed"
                      else "not_extracted" if status == "not_requested" else "unknown")
            _write(root, f"items/{item['id']}.json",
                   {"schema_version": 1, "item_id": item["id"],
                    "body": {"kind": "unavailable", "reason": reason}})
        if output.exists():
            # Do not silently wipe an unrelated directory.
            if not (output / "manifest.json").is_file():
                raise ValidationError("existing output is not a catalog")
            backup = output.parent / (".catalog-old-" + uuid4().hex)
            output.rename(backup)
            try:
                root.rename(output)
            except Exception:
                backup.rename(output)
                raise
            else:
                shutil.rmtree(backup)
        else:
            root.rename(output)
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline collector -> public catalog v2")
    parser.add_argument("--archive", type=Path, required=True,
                        help="public/items.ndjson, never research/items.ndjson")
    parser.add_argument("--registry", type=Path, default=Path("config/sources.json"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = publish(args.archive, args.registry, args.output)
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError) as exc:
        print(f"publish rejected: {type(exc).__name__}", file=sys.stderr)
        return 1
    print(json.dumps({"revision": result["revision"], "items": result["total_items"],
                      "pages": len(result["pages"])}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
