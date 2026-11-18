"""Fixture-first collection CLI. Live network requires an explicit opt-in."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from .fetch import SafeFetcher, FetchError
from .models import ValidationError, load_registry
from .runtime import run


class FixtureFetcher:
    def __init__(self, fixture_map: Path):
        entries = json.loads(fixture_map.read_text(encoding="utf-8"))
        if not isinstance(entries, dict) or not entries:
            raise ValidationError("fixture map must contain URLs")
        self.entries = entries
        self.folder = fixture_map.parent.resolve()

    def get(self, url, source):
        from .fetch import SafeFetcher
        SafeFetcher._check_host(url, source)
        filename = self.entries.get(url)
        if not isinstance(filename, str) or not filename or Path(filename).name != filename:
            raise FetchError("network_error")
        file = (self.folder / filename).resolve()
        if file.parent != self.folder:
            raise FetchError("unsafe_url")
        return url, file.read_text(encoding="utf-8")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Fixture-first news source collector")
    parser.add_argument("--registry", type=Path, default=Path("config/sources.json"))
    parser.add_argument("--output", type=Path, default=Path(".local/newsagg"))
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--fixture-map", type=Path)
    group.add_argument("--live", action="store_true", help="Opt in to network access; obey site terms/robots")
    parser.add_argument("--at", help="aware ISO timestamp for reproducible fixture runs")
    parser.add_argument("--force", action="store_true", help="ignore per-source cadence")
    args = parser.parse_args(argv)
    try:
        tz, sources = load_registry(args.registry)
        now = datetime.fromisoformat(args.at.replace("Z", "+00:00")) if args.at else datetime.now(timezone.utc)
        fetcher = SafeFetcher() if args.live else FixtureFetcher(args.fixture_map)
        report = run(sources, fetcher, args.output, now=now, force=args.force, timezone_name=tz)
    except (ValidationError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"collection setup/validation failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["status"] in ("ok", "idle") else 2 if report["status"] == "partial" else 1


if __name__ == "__main__":
    raise SystemExit(main())
