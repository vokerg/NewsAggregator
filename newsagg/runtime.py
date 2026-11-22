"""Single-writer, idempotent, metadata-only public collector output."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
import fcntl
import json
import os
from pathlib import Path
import tempfile
from typing import Any

from .adapters import Candidate, discover, extract_body
from .fetch import FetchError
from .models import (Source, ValidationError, canonical_url, check_public_text, item_id,
                     parse_timestamp, require_url, utc_iso)


ITEM_KEYS = frozenset({
    "schema_version", "item_id", "source_id", "original_url", "canonical_url", "headline",
    "published_at", "first_seen_at", "last_seen_at", "language", "perspective_ids_at_capture",
    "about_country_codes", "publisher_country", "editorial_labels_at_capture", "body_extraction_status",
    "body_char_count", "body_publication_status", "rights_profile", "extraction_status",
})
BODY_STATES = {"not_requested", "unavailable", "extracted", "failed"}
SOURCE_STATES = {"ok", "partial", "failed", "idle"}
ERROR_CODES = {"unsafe_url", "cross_publisher_host", "unsafe_destination", "dns_error", "robots_unavailable",
               "robots_disallowed", "redirect_error", "oversized_response", "network_error", "rate_limited",
               "http_error", "unsupported_content_type", "malformed_feed", "pagination_loop", "bad_item",
               "unexpected_error", "body_unavailable"}


def make_item(source: Source, candidate: Candidate, now: datetime,
              body_status: str, body_count: int | None, published_at: str | None) -> dict[str, Any]:
    original = require_url(candidate.original_url)
    canonical = canonical_url(original)
    if body_status not in BODY_STATES:
        raise ValidationError("unsupported body status")
    headline = check_public_text(candidate.headline)
    if not headline:
        raise ValidationError("empty headline")
    item = {
        "schema_version": 1,
        "item_id": item_id(source.source_id, canonical), "source_id": source.source_id,
        "original_url": original, "canonical_url": canonical,
        "headline": headline, "published_at": published_at,
        "first_seen_at": utc_iso(now), "last_seen_at": utc_iso(now),
        "language": source.languages[0],  # source-specific mapping later; never inferred from event geography
        "perspective_ids_at_capture": list(source.perspective_ids),
        "about_country_codes": [],  # unknown is not publisher_country
        "publisher_country": source.publisher_country,
        "editorial_labels_at_capture": list(source.editorial_labels),
        "extraction_status": "body_available" if body_status == "extracted" else "headline_only",
        "body_extraction_status": body_status, "body_char_count": body_count,
        "body_publication_status": "not_published",  # independent of captured body availability
        "rights_profile": source.rights_profile,
    }
    validate_public_item(item)
    return item


def validate_public_item(row: dict[str, Any]) -> None:
    """Fail closed before write and when loading an existing public archive."""
    if not isinstance(row, dict) or set(row) != ITEM_KEYS or type(row["schema_version"]) is not int or row["schema_version"] != 1:
        raise ValidationError("unexpected public item keys or version")
    original, canonical = require_url(row["original_url"]), require_url(row["canonical_url"])
    if canonical_url(original) != canonical:
        raise ValidationError("canonical URL mismatch")
    if not isinstance(row["source_id"], str) or item_id(row["source_id"], canonical) != row["item_id"]:
        raise ValidationError("unstable item ID")
    if not isinstance(row["headline"], str) or not check_public_text(row["headline"]) or row["headline"] != row["headline"].strip():
        raise ValidationError("unsafe headline")
    for key in ("published_at", "first_seen_at", "last_seen_at"):
        if (row[key] is None and key != "published_at") or (row[key] is not None and (not isinstance(row[key], str) or parse_timestamp(row[key]) != row[key])):
            raise ValidationError(f"invalid {key}")
    if row["body_extraction_status"] not in BODY_STATES or row["extraction_status"] not in {"headline_only", "body_available"}:
        raise ValidationError("invalid extraction status")
    if (row["extraction_status"] == "body_available") != (row["body_extraction_status"] == "extracted"):
        raise ValidationError("body state mismatch")
    chars = row["body_char_count"]
    if (row["body_extraction_status"] == "extracted" and (type(chars) is not int or chars < 1)) or (row["body_extraction_status"] != "extracted" and chars is not None):
        raise ValidationError("body length inconsistent with extraction")
    if row["body_publication_status"] != "not_published" or row["rights_profile"] not in {"unknown", "metadata_only", "licensed_text"}:
        raise ValidationError("unauthorized public body")
    if row["about_country_codes"] != []:  # classification is outside issue #8
        raise ValidationError("unsupported subject classification")
    if row["publisher_country"] is not None and (not isinstance(row["publisher_country"], str) or len(row["publisher_country"]) != 2 or not row["publisher_country"].isupper()):
        raise ValidationError("invalid country")
    if (not isinstance(row["language"], str) or len(row["language"]) > 16 or
            not isinstance(row["perspective_ids_at_capture"], list) or not row["perspective_ids_at_capture"] or
            not isinstance(row["editorial_labels_at_capture"], list)):
        raise ValidationError("invalid publisher metadata")
    for value in [row["language"], *row["perspective_ids_at_capture"], *row["editorial_labels_at_capture"]]:
        if not isinstance(value, str) or check_public_text(value, 100) != value:
            raise ValidationError("unsafe publisher metadata")


def _read_json(path: Path, fallback: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else fallback


def _read_items(path: Path) -> dict[str, dict[str, Any]]:
    items = {}
    if not path.exists():
        return items
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            raise ValidationError("empty line in public archive")
        row = json.loads(line)
        validate_public_item(row)
        if row["item_id"] in items:
            raise ValidationError("duplicate row in existing archive")
        items[row["item_id"]] = row
    return items


def _atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _merge(previous: dict[str, Any] | None, item: dict[str, Any]) -> dict[str, Any]:
    if previous is None:
        return item
    # Original URL, title and perspective metadata at capture remain frozen.
    merged = dict(previous)
    merged["last_seen_at"] = max(previous["last_seen_at"], item["last_seen_at"])
    if previous["body_extraction_status"] != "extracted" and item["body_extraction_status"] == "extracted":
        for name in ("body_extraction_status", "body_char_count", "extraction_status"):
            merged[name] = item[name]
    validate_public_item(merged)
    return merged


def _source_due(state: dict, source: Source, now: datetime, force: bool) -> bool:
    if force:
        return True
    last = parse_timestamp(state.get("last_attempt_at"))
    if last is None:
        return True
    return now >= datetime.fromisoformat(last.replace("Z", "+00:00")) + timedelta(minutes=source.cadence_minutes)


def run(registry: list[Source], fetcher, output: Path, *, now: datetime, force: bool = False,
        timezone_name: str = "UTC") -> dict[str, Any]:
    """One source error never halts another; writer lock serializes runs."""
    now_text = utc_iso(now)
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".collector.lock").open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        archive_path = output / "public" / "items.ndjson"
        state_path = output / "state.json"
        status_path = output / "public" / "status.json"
        items = _read_items(archive_path)
        state = _read_json(state_path, {"schema_version": 1, "sources": {}})
        if (not isinstance(state, dict) or set(state) != {"schema_version", "sources"}
                or state["schema_version"] != 1 or not isinstance(state["sources"], dict)):
            raise ValidationError("invalid persistent state")
        for sid, row in state["sources"].items():
            if (not isinstance(sid, str) or not isinstance(row, dict) or
                    not set(row).issubset({"last_attempt_at", "last_success_at", "last_status", "cursor"}) or
                    any(key in row and (not isinstance(row[key], str) or parse_timestamp(row[key]) != row[key])
                        for key in ("last_attempt_at", "last_success_at")) or
                    ("cursor" in row and row["cursor"] is not None and parse_timestamp(row["cursor"]) != row["cursor"]) or
                    ("last_status" in row and row["last_status"] not in SOURCE_STATES)):
                raise ValidationError("unsafe persistent state")
        sources_status = {}
        for source in registry:
            if not source.enabled:
                continue
            previous = dict(state["sources"].get(source.source_id, {}))
            if not _source_due(previous, source, now, force):
                sources_status[source.source_id] = {"status": "idle", "discovered": 0, "extracted": 0, "skipped": 0, "error_code": None}
                continue
            result = {"status": "ok", "discovered": 0, "extracted": 0, "skipped": 0, "error_code": None}
            cursor = None
            try:
                discovery = discover(source, fetcher, now)
                cursor = discovery.cursor_candidate
                result["discovered"], result["skipped"] = len(discovery.items), discovery.skipped
                if discovery.skipped:
                    result["status"] = "partial"
                    result["error_code"] = "bad_item"
                for candidate in discovery.items:
                    body_status, count, published = "not_requested", None, candidate.published_at
                    if source.extract_body:
                        try:
                            _, body = fetcher.get(candidate.original_url, source)
                            body_text, extracted_published = extract_body(body)
                            if body_text:
                                body_status, count = "extracted", len(body_text)
                                published = published or extracted_published
                                result["extracted"] += 1
                            else:
                                body_status = "unavailable"
                        except Exception:
                            # Optional retrieval/parsing must never drop the discovered
                            # headline, even if a publisher's malformed HTML crashes a
                            # parser or the fixture transport fails unexpectedly.
                            body_status = "failed"
                            result["status"] = "partial"
                            result["error_code"] = "body_unavailable"
                    try:
                        row = make_item(source, candidate, now, body_status, count, published)
                    except ValidationError:
                        result["skipped"] += 1
                        result["status"] = "partial"
                        result["error_code"] = "bad_item"
                        continue
                    items[row["item_id"]] = _merge(items.get(row["item_id"]), row)
            except FetchError as exc:
                result["status"] = "failed"
                result["error_code"] = exc.code if exc.code in ERROR_CODES else "unexpected_error"
            except (ValidationError, ValueError, TypeError):
                result["status"] = "failed"
                result["error_code"] = "bad_item"
            except Exception:
                # Untrusted source/adapter bugs must not prevent other sources from collecting.
                result["status"] = "failed"
                result["error_code"] = "unexpected_error"
            # Never write exception strings, source URLs or raw captured payloads to status.
            previous.update({"last_attempt_at": now_text, "last_status": result["status"]})
            if result["status"] == "ok":
                previous.update({"last_success_at": now_text, "cursor": cursor})
            state["sources"][source.source_id] = previous
            sources_status[source.source_id] = result
        attempted = [v["status"] for v in sources_status.values() if v["status"] != "idle"]
        overall = ("idle" if not attempted else "ok" if all(v == "ok" for v in attempted) else
                   "failed" if all(v == "failed" for v in attempted) else "partial")
        status = {"schema_version": 1, "run_at": now_text, "timezone": timezone_name,
                  "status": overall, "configured_count": len(registry),
                  "enabled_count": sum(v.enabled for v in registry), "total_item_count": len(items),
                  "sources": sources_status}
        # All public writes are strictly allowlisted; validate entire archive before replacing any file.
        for item in items.values():
            validate_public_item(item)
        public_lines = "".join(json.dumps(items[key], ensure_ascii=False, sort_keys=True) + "\n" for key in sorted(items))
        # Archive first, then state: crash between them leaves retryable, deduplicated items.
        _atomic(archive_path, public_lines)
        _atomic(state_path, json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        _atomic(status_path, json.dumps(status, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        return status
