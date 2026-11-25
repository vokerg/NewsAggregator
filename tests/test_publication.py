"""Offline contract tests for the commit-driven v2 public projection."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from newsagg.models import ValidationError, load_registry
from newsagg.publish import publish
from newsagg.runtime import make_item


REGISTRY = Path("tests/fixtures/registry.json")


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.archive = self.root / "collector" / "public" / "items.ndjson"
        self.archive.parent.mkdir(parents=True)
        self.output = self.root / "public" / "catalog"
        _, sources = load_registry(REGISTRY)
        self.sources = {s.source_id: s for s in sources}
        self.source = self.sources["example-rss"]

    def row(self, i: int, *, published="2026-11-18T23:59:59Z", status="extracted"):
        candidate = SimpleNamespace(
            original_url=f"https://news.example.org/stories/{i}",
            headline=f"News item {i}",
            published_at=published,
            publisher_description=None,
        )
        row = make_item(self.source, candidate, datetime(2026, 11, 19, tzinfo=timezone.utc),
                        status, 250 if status == "extracted" else None, published)
        return row

    def write(self, rows):
        self.archive.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
                                encoding="utf-8")

    def load(self, path):
        return json.loads(path.read_text(encoding="utf-8"))

    def test_bounded_partitions_are_deterministic_and_rights_only(self):
        rows = [self.row(i) for i in range(105)]
        rows[0] = self.row(0, published="2026-11-19T00:00:00Z")
        rows[1] = self.row(1, published=None, status="failed")
        self.write(rows)
        first = publish(self.archive, REGISTRY, self.output)
        self.assertEqual(first["total_items"], 105)
        self.assertEqual([(p["day"], p["part"], p["count"]) for p in first["pages"]],
                         [("2026-11-19", 1, 2), ("2026-11-18", 1, 100), ("2026-11-18", 2, 3)])
        item_id = rows[2]["item_id"]
        metadata = self.load(self.output / "metadata" / f"{item_id}.json")
        self.assertEqual(metadata["items"][0]["original_url"], rows[2]["original_url"])
        self.assertEqual(metadata["items"][0]["perspective_ids"], ["dk-media"])
        self.assertEqual(metadata["items"][0]["about_country_codes"], [])
        self.assertEqual(metadata["items"][0]["language"], "da")
        self.assertNotIn("body_char_count", json.dumps(metadata))
        self.assertNotIn("canonical_url", json.dumps(metadata))
        body = self.load(self.output / "items" / f"{item_id}.json")
        self.assertEqual(body["body"], {"kind": "unavailable", "reason": "rights"})
        self.assertEqual(self.load(self.output / "items" / f"{rows[1]['item_id']}.json")["body"]["reason"], "failed")
        before = (self.output / "manifest.json").read_bytes()
        second = publish(self.archive, REGISTRY, self.output)
        self.assertEqual(first, second)
        self.assertEqual((self.output / "manifest.json").read_bytes(), before)

    def test_fails_closed_without_erasing_previous_catalog(self):
        row = self.row(3)
        self.write([row])
        publish(self.archive, REGISTRY, self.output)
        previous = (self.output / "manifest.json").read_bytes()
        self.write([row, row])
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output)
        self.assertEqual((self.output / "manifest.json").read_bytes(), previous)
        row["headline"] = "private token=supersecret"
        self.write([row])
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output)
        self.assertEqual((self.output / "manifest.json").read_bytes(), previous)

    def test_rejects_local_only_archive_and_unknown_source(self):
        row = self.row(2)
        row["rights_profile"] = "local_only"
        self.write([row])
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output)
        row = self.row(3)
        row["source_id"] = "not-in-registry"
        self.write([row])
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output)

    def test_rejects_unsafe_publisher_link_and_raw_body(self):
        row = self.row(4)
        row["original_url"] += "?api_token=secret"
        self.write([row])
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output)
        row = self.row(4)
        row["body"] = "Copyrighted full article"
        self.write([row])
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output)


    def test_verified_partial_coverage_and_mismatched_status(self):
        self.write([self.row(7)])
        status_path = self.archive.parent / "status.json"
        status = {
            "schema_version": 1,
            "run_at": "2026-11-19T10:00:00Z",
            "timezone": "Europe/Copenhagen",
            "status": "partial",
            "configured_count": 2,
            "enabled_count": 2,
            "total_item_count": 1,
            "sources": {
                "example-rss": {"status": "partial", "discovered": 1,
                                "extracted": 0, "skipped": 1, "error_code": "bad_item"},
                "example-web": {"status": "idle", "discovered": 0,
                                "extracted": 0, "skipped": 0, "error_code": None},
            },
        }
        status_path.write_text(json.dumps(status), encoding="utf-8")
        result = publish(self.archive, REGISTRY, self.output, status=status_path)
        self.assertEqual(result["coverage_status"], "partial")
        status["total_item_count"] = 2
        status_path.write_text(json.dumps(status), encoding="utf-8")
        with self.assertRaises(ValidationError):
            publish(self.archive, REGISTRY, self.output, status=status_path)
        self.assertEqual(self.load(self.output / "manifest.json")["coverage_status"], "partial")

    def test_empty_archive_is_explicit_not_fixture_fallback(self):
        self.write([])
        result = publish(self.archive, REGISTRY, self.output)
        self.assertEqual(result["total_items"], 0)
        self.assertEqual(result["pages"], [])
        self.assertFalse((self.output / "items").exists())


if __name__ == "__main__":
    unittest.main()
