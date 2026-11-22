from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from newsagg.__main__ import FixtureFetcher
from newsagg.adapters import Candidate, discover, extract_body, parse_feed, parse_index
from newsagg.fetch import FetchError, Response, SafeFetcher, public_ips
from newsagg.models import (Source, ValidationError, canonical_url, check_public_text,
                            load_registry, parse_timestamp, require_url)
from newsagg.runtime import _read_items, make_item, run, validate_public_item


ROOT = Path(__file__).resolve().parent
FIX = ROOT / "fixtures"
AT = datetime(2026, 11, 18, 8, 0, tzinfo=timezone.utc)


def sources():
    return load_registry(FIX / "registry.json")[1]


def fixtures():
    return FixtureFetcher(FIX / "fixtures-map.json")


class RegistryTests(unittest.TestCase):
    def test_empty_real_registry_has_no_enabled_sources(self):
        self.assertEqual(load_registry(Path("config/sources.json"))[1], [])

    def test_registry_rejects_unknown_timezone(self):
        payload = json.loads((FIX / "registry.json").read_text())
        payload["timezone"] = "Not/A_Real_Timezone"
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "registry.json"
            path.write_text(json.dumps(payload))
            with self.assertRaises(ValidationError):
                load_registry(path)

    def test_registry_rejects_duplicate_ids_and_unknown_fields(self):
        base = json.loads((FIX / "registry.json").read_text())
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "registry.json"
            base["sources"].append(base["sources"][0])
            path.write_text(json.dumps(base))
            with self.assertRaises(ValidationError):
                load_registry(path)
            base["sources"].pop()
            base["sources"][0]["llm_summary"] = "not part of ingest"
            path.write_text(json.dumps(base))
            with self.assertRaises(ValidationError):
                load_registry(path)

    def test_source_perspective_is_distinct_from_subject_and_country(self):
        with tempfile.TemporaryDirectory() as d:
            status = run(sources(), fixtures(), Path(d), now=AT)
            rows = _read_items(Path(d) / "public/items.ndjson")
            self.assertEqual(status["status"], "ok")
            item = next(r for r in rows.values() if "Ukraine" in r["headline"])
            self.assertEqual(item["publisher_country"], "DK")
            self.assertEqual(item["perspective_ids_at_capture"], ["dk-media"])
            self.assertEqual(item["about_country_codes"], [])
            self.assertEqual(item["body_publication_status"], "not_published")
            self.assertNotIn("body", item)

    def test_url_rules_and_identity(self):
        for url in ["http://news.example.org/x", "https://user:pass@news.example.org/x",
                    "https://127.0.0.1/x", "https://news.example.org:8443/x",
                    "https://news.example.org/x?access_token=secret",
                    "https://news.example.org/x?client_secret=secret",
                    "https://news.example.org/x?session_id=secret",
                    "https://news.example.org/x?X-Amz-Signature=secret",
                    "https://news.example.org/x?refreshToken=secret"]:
            with self.assertRaises(ValidationError, msg=url):
                require_url(url)
        self.assertEqual(canonical_url("https://news.example.org/a?utm_source=x&n=1#z"), "https://news.example.org/a?n=1")
        self.assertEqual(parse_timestamp("2026-11-18T04:00:00+02:00"), "2026-11-18T02:00:00Z")
        self.assertIsNone(parse_timestamp("2026-11-18 04:00:00"))


class AdapterTests(unittest.TestCase):
    def test_rss_and_undated(self):
        result = parse_feed((FIX / "rss.xml").read_text(), sources()[0])
        self.assertEqual(len(result.items), 2)
        self.assertEqual(result.items[0].published_at, "2026-11-17T22:30:00Z")
        self.assertIsNone(result.items[1].published_at)
        self.assertTrue(result.items[0].original_url.endswith("utm_source=rss"))

    def test_atom(self):
        result = parse_feed((FIX / "atom.xml").read_text(), sources()[0])
        self.assertEqual(result.items[0].headline, "Atom entry")
        self.assertEqual(result.items[0].published_at, "2026-11-17T23:00:00Z")

    def test_malformed_or_entity_feed_fails_closed(self):
        for payload in ["oops", "<!DOCTYPE rss [<!ENTITY x 'BAD'>]><rss/>", "<html/>"]:
            with self.assertRaises(FetchError):
                parse_feed(payload, sources()[0])

    def test_index_pagination_bounded_and_original_links(self):
        result = discover(sources()[1], fixtures(), AT)
        self.assertEqual(len(result.items), 2)
        self.assertEqual(result.items[0].published_at, "2026-11-17T16:30:00Z")
        self.assertEqual(result.items[1].original_url, "https://news.example.org/stories/four")

    def test_body_extraction_excludes_scripts(self):
        body, published = extract_body((FIX / "body.html").read_text())
        self.assertEqual(body, "Article heading First public-ish sentence. Second sentence.")
        self.assertNotIn("SECRET_TOKEN", body)
        self.assertEqual(published, "2026-11-18T07:00:00Z")

    def test_body_void_tags_in_hidden_nodes_do_not_hide_visible_text(self):
        html = ('<article><nav><img src="/x">Hidden <span>navigation</span></nav>'
                '<p>Visible first.</p><script>SECRET_TOKEN</script>'
                '<p>Visible second.</p></article>')
        body, _ = extract_body(html)
        self.assertEqual(body, "Visible first. Visible second.")
        self.assertNotIn("SECRET_TOKEN", body or "")
        self.assertNotIn("navigation", body or "")

    def test_body_malformed_nested_tags_do_not_leak_hidden_text(self):
        html = ('<article><nav><span>Hidden</span></nav>'
                '<p>Visible</p></article> Outside')
        body, _ = extract_body(html)
        self.assertEqual(body, "Visible")

    def test_invalid_article_link_is_skipped(self):
        result, _ = parse_index('<article><a href="https://evil.org/secret">Story</a></article>', "https://news.example.org/news", sources()[1])
        self.assertEqual((len(result.items), result.skipped), (0, 1))


class FetchTests(unittest.TestCase):
    def test_rejects_private_and_mixed_dns(self):
        with self.assertRaises(FetchError):
            public_ips("news.example.org", lambda _h: ["93.184.216.34", "127.0.0.1"])
        with self.assertRaises(FetchError):
            public_ips("news.example.org", lambda _h: ["169.254.169.254"])

    def make_fetcher(self, responses, **kwargs):
        calls = []
        def transport(url, ip, timeout, limit):
            calls.append((url, ip))
            return responses[url]
        f = SafeFetcher(transport=transport, resolver=lambda h: ["8.8.8.8"],
                        min_interval=0, retries=0, **kwargs)
        return f, calls

    def test_robots_disallow_and_fail_closed(self):
        responses = {"https://news.example.org/robots.txt": Response(200, b"User-agent: *\nDisallow: /blocked\n", {})}
        f, calls = self.make_fetcher(responses)
        with self.assertRaisesRegex(FetchError, "robots_disallowed"):
            f.get("https://news.example.org/blocked", sources()[0])
        self.assertEqual(len(calls), 1)
        f, _ = self.make_fetcher({"https://news.example.org/robots.txt": Response(503, b"error", {})})
        with self.assertRaisesRegex(FetchError, "robots_unavailable"):
            f.get("https://news.example.org/rss", sources()[0])

    def test_redirect_unsafe_domain_and_cycle(self):
        responses = {
            "https://news.example.org/robots.txt": Response(404, b"", {}),
            "https://news.example.org/rss": Response(302, b"", {"location": "https://evil.org/steal"}),
        }
        f, calls = self.make_fetcher(responses)
        with self.assertRaisesRegex(FetchError, "cross_publisher_host"):
            f.get("https://news.example.org/rss", sources()[0])
        self.assertFalse(any(u.startswith("https://evil.org") for u, _ in calls))

    def test_redirect_target_robots_checked(self):
        responses = {
            "https://news.example.org/robots.txt": Response(200, b"User-agent: *\nDisallow: /private\n", {}),
            "https://news.example.org/rss": Response(302, b"", {"location": "/private"}),
            "https://news.example.org/private": Response(200, b"secret", {"content-type": "text/plain"}),
        }
        f, calls = self.make_fetcher(responses)
        with self.assertRaisesRegex(FetchError, "robots_disallowed"):
            f.get("https://news.example.org/rss", sources()[0])
        self.assertNotIn(("https://news.example.org/private", "8.8.8.8"), calls)

    def test_bounded_response_mime_and_rate_limited(self):
        responses = {"https://news.example.org/robots.txt": Response(404, b"", {}),
                     "https://news.example.org/rss": Response(200, b"X"*30, {"content-type": "application/octet-stream"})}
        f, _ = self.make_fetcher(responses, max_bytes=20)
        with self.assertRaisesRegex(FetchError, "oversized_response"):
            f.get("https://news.example.org/rss", sources()[0])
        responses["https://news.example.org/rss"] = Response(200, b"OK", {"content-type": "application/octet-stream"})
        f, _ = self.make_fetcher(responses)
        with self.assertRaisesRegex(FetchError, "unsupported_content_type"):
            f.get("https://news.example.org/rss", sources()[0])
        responses["https://news.example.org/rss"] = Response(429, b"", {})
        f, _ = self.make_fetcher(responses)
        with self.assertRaisesRegex(FetchError, "rate_limited"):
            f.get("https://news.example.org/rss", sources()[0])

    def test_bounded_retry_then_success(self):
        count = [0]
        def transport(url, ip, timeout, limit):
            if url.endswith("robots.txt"):
                return Response(404, b"", {})
            count[0] += 1
            return (Response(503, b"", {"retry-after": "1"}) if count[0] == 1 else
                    Response(200, b"success", {"content-type": "text/plain"}))
        delays = []
        f = SafeFetcher(transport=transport, resolver=lambda h: ["8.8.8.8"],
                        min_interval=0, retries=1, sleeper=delays.append)
        _, body = f.get("https://news.example.org/rss", sources()[0])
        self.assertEqual(body, "success")
        self.assertEqual(count[0], 2)
        self.assertEqual(delays, [1.0])

    def test_rate_interval_observed(self):
        times = [0.0]
        sleep_calls = []
        def snooze(seconds):
            sleep_calls.append(seconds)
            times[0] += seconds
        responses = {"https://news.example.org/robots.txt": Response(404, b"", {}),
                     "https://news.example.org/rss": Response(200, b"ok", {"content-type": "text/plain"})}
        f, calls = self.make_fetcher(responses, clock=lambda: times[0], sleeper=snooze)
        f.min_interval = 1.0
        f.get("https://news.example.org/rss", sources()[0])
        self.assertGreaterEqual(sum(sleep_calls), 1.0)


class RuntimeTests(unittest.TestCase):
    def test_e2e_idempotence_cadence_and_timestamp(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)
            first = run(sources(), fixtures(), path, now=AT)
            rows = _read_items(path / "public/items.ndjson")
            self.assertEqual(first["status"], "ok")
            self.assertEqual((first["total_item_count"], first["sources"]["example-rss"]["extracted"]), (4, 2))
            self.assertEqual(len(rows), 4)
            second = run(sources(), fixtures(), path, now=AT + timedelta(minutes=5))
            self.assertEqual(second["status"], "idle")
            self.assertEqual(second["total_item_count"], 4)
            third = run(sources(), fixtures(), path, now=AT + timedelta(hours=5))
            self.assertEqual(third["total_item_count"], 4)
            self.assertTrue(all(r["first_seen_at"] == "2026-11-18T08:00:00Z" for r in _read_items(path / "public/items.ndjson").values()))
            self.assertEqual(first["sources"]["example-rss"]["status"], "ok")
            self.assertEqual(first["sources"]["example-web"]["status"], "ok")

    def test_failures_isolated_cursor_retained_and_partial(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)
            run(sources(), fixtures(), path, now=AT)
            before = json.loads((path / "state.json").read_text())
            class BrokenFetcher:
                def get(self, url, source):
                    if source.source_id == "example-rss":
                        raise FetchError("network_error")
                    return fixtures().get(url, source)
            report = run(sources(), BrokenFetcher(), path, now=AT + timedelta(hours=5))
            state = json.loads((path / "state.json").read_text())
            self.assertEqual(report["status"], "partial")
            self.assertEqual(report["sources"]["example-rss"]["status"], "failed")
            self.assertEqual(state["sources"]["example-rss"]["cursor"], before["sources"]["example-rss"]["cursor"])
            self.assertEqual(state["sources"]["example-rss"]["last_success_at"], before["sources"]["example-rss"]["last_success_at"])
            self.assertEqual(report["sources"]["example-web"]["status"], "ok")
            self.assertNotIn("https://", (path / "public/status.json").read_text())

    def test_body_failure_partial_and_headline_preserved(self):
        class BrokenBody:
            def get(self, url, source):
                if "/stories/" in url:
                    raise FetchError("http_error")
                return fixtures().get(url, source)
        with tempfile.TemporaryDirectory() as d:
            report = run(sources(), BrokenBody(), Path(d), now=AT)
            self.assertEqual(report["status"], "partial")
            rows = _read_items(Path(d) / "public/items.ndjson")
            self.assertTrue(any(v["body_extraction_status"] == "failed" for v in rows.values()))
            self.assertEqual(len(rows), 4)
            state = json.loads((Path(d) / "state.json").read_text())
            self.assertIsNone(state["sources"]["example-rss"].get("cursor"))

    def test_body_parser_exception_preserves_headline_metadata(self):
        with tempfile.TemporaryDirectory() as d:
            with patch("newsagg.runtime.extract_body", side_effect=ValueError("secret=private")):
                report = run(sources(), fixtures(), Path(d), now=AT)
            self.assertEqual(report["status"], "partial")
            self.assertEqual(report["sources"]["example-rss"]["status"], "partial")
            self.assertEqual(report["sources"]["example-rss"]["error_code"], "body_unavailable")
            rows = _read_items(Path(d) / "public/items.ndjson")
            self.assertEqual(len(rows), 4)
            self.assertEqual(sum(row["body_extraction_status"] == "failed" for row in rows.values()), 2)
            public = (Path(d) / "public/status.json").read_text()
            self.assertNotIn("secret=private", public)

    def test_public_projection_rejects_secrets_and_body(self):
        with self.assertRaises(ValidationError):
            check_public_text("authorization: Bearer sk-supersecrettokenwithletters")
        with self.assertRaises(ValidationError):
            make_item(sources()[0], Candidate("https://news.example.org/stories/x?token=s3cr3t", "Clean", None), AT, "not_requested", None, None)
        good = make_item(sources()[0], Candidate("https://news.example.org/stories/x", "Valid", None), AT, "not_requested", None, None)
        good["body_text"] = "private article text"
        with self.assertRaises(ValidationError):
            validate_public_item(good)

    def test_malformed_archive_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "public/items.ndjson"
            path.parent.mkdir(parents=True)
            path.write_text('{"malformed":true}\n')
            with self.assertRaises(ValidationError):
                run(sources(), fixtures(), Path(d), now=AT)
            self.assertEqual(path.read_text(), '{"malformed":true}\n')

    def test_corrupt_or_secret_state_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "state.json"
            path.write_text(json.dumps({"schema_version": 1, "sources": {
                "example-rss": {"cursor": "https://bad.example?token=secret"}}}))
            with self.assertRaises(ValidationError):
                run(sources(), fixtures(), Path(d), now=AT)
            self.assertIn("token=secret", path.read_text())  # original not overwritten

    def test_cli_fixture_smoke_and_repeat(self):
        with tempfile.TemporaryDirectory() as d:
            command = [sys.executable, "-m", "newsagg", "--registry", str(FIX / "registry.json"),
                       "--fixture-map", str(FIX / "fixtures-map.json"), "--output", d, "--at", "2026-11-18T08:00:00Z"]
            p = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertEqual(json.loads(p.stdout)["total_item_count"], 4)
            p = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertEqual(json.loads(p.stdout)["total_item_count"], 4)


if __name__ == "__main__":
    unittest.main()
