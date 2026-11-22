"""RSS/Atom and bounded HTML-index discovery; optional article body extraction."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import re
from urllib.parse import urljoin, urlsplit
import xml.etree.ElementTree as ET

from .models import Source, ValidationError, parse_timestamp, require_url
from .fetch import FetchError


@dataclass(frozen=True)
class Candidate:
    original_url: str
    headline: str
    published_at: str | None


@dataclass(frozen=True)
class Discovery:
    items: list[Candidate]
    skipped: int
    cursor_candidate: str | None


def _date(value: str | None) -> str | None:
    if not value:
        return None
    result = parse_timestamp(value)
    if result is not None:
        return result
    try:
        return parse_timestamp(parsedate_to_datetime(value).isoformat())
    except (ValueError, TypeError, IndexError, OverflowError):
        return None


def _text(node: ET.Element, name: str) -> str:
    found = node.find(name)
    return "" if found is None else " ".join("".join(found.itertext()).split())


def _candidate(url: str, headline: str, published: str | None, source: Source) -> Candidate:
    url = require_url(url)
    hostname = urlsplit(url).hostname
    if not any(hostname == h or hostname.endswith("." + h) for h in source.allowed_hosts):
        raise ValidationError("off-publisher article URL")
    headline = " ".join(headline.split())
    if not headline or len(headline) > 500:
        raise ValidationError("missing or oversized headline")
    return Candidate(url, headline, published)


def parse_feed(xml_text: str, source: Source) -> Discovery:
    if "<!DOCTYPE" in xml_text.upper() or "<!ENTITY" in xml_text.upper():
        raise FetchError("malformed_feed")
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise FetchError("malformed_feed") from exc
    atom = "{http://www.w3.org/2005/Atom}"
    if root.tag in ("rss", "{http://purl.org/rss/1.0/}RDF", "RDF"):
        entries = root.findall("./channel/item") if root.tag == "rss" else root.findall("{http://purl.org/rss/1.0/}item")
        rows = []
        for e in entries[:source.max_items]:
            rows.append((_text(e, "link"), _text(e, "title"), _date(_text(e, "pubDate") or _text(e, "{http://purl.org/dc/elements/1.1/}date"))))
    elif root.tag == atom + "feed":
        rows = []
        for e in root.findall(atom + "entry")[:source.max_items]:
            href = next((l.get("href", "") for l in e.findall(atom + "link") if l.get("rel", "alternate") == "alternate"), "")
            rows.append((href, _text(e, atom + "title"), _date(_text(e, atom + "published") or _text(e, atom + "updated"))))
    else:
        raise FetchError("malformed_feed")
    items, skipped = [], 0
    for url, headline, published in rows:
        try:
            items.append(_candidate(url, headline, published, source))
        except ValidationError:
            skipped += 1
    return Discovery(items, skipped, None)


VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class IndexParser(HTMLParser):
    def __init__(self, item_tag: str):
        super().__init__(convert_charrefs=True)
        self.item_tag = item_tag
        self.depth = 0
        self.link_depth = 0
        self.anchor_url = ""
        self.parts: list[str] = []
        self.date: str | None = None
        self.rows: list[tuple[str, str, str | None]] = []
        self.pending: list[tuple[str, str]] = []
        self.next_url: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "a" and "next" in (a.get("rel") or "").split():
            self.next_url = a.get("href")
        if tag == self.item_tag:
            self.depth += 1
            if self.depth == 1:
                self.date = None
                self.pending = []
        elif self.depth and tag not in VOID_TAGS:
            self.depth += 1
        if not self.depth:
            return
        if tag == "a" and not self.anchor_url and a.get("href"):
            self.anchor_url = a["href"] or ""
            self.link_depth = self.depth
            self.parts = []
        if tag == "time" and a.get("datetime"):
            self.date = _date(a["datetime"])

    def handle_data(self, data: str) -> None:
        if self.anchor_url:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.anchor_url and self.depth >= self.link_depth:
            self.pending.append((self.anchor_url, " ".join(" ".join(self.parts).split())))
            self.anchor_url, self.parts, self.link_depth = "", [], 0
        if self.depth and tag not in VOID_TAGS:
            self.depth -= 1
            if self.depth == 0:
                self.rows.extend((url, title, self.date) for url, title in self.pending)
                self.pending = []


def parse_index(html_text: str, base_url: str, source: Source) -> tuple[Discovery, str | None]:
    parser = IndexParser(source.item_tag)
    parser.feed(html_text)
    rows, skipped = [], 0
    for href, title, published in parser.rows[:source.max_items]:
        url = urljoin(base_url, href)
        try:
            if not urlsplit(url).path.startswith(source.link_path_prefix):
                skipped += 1
                continue
            rows.append(_candidate(url, title, published, source))
        except ValidationError:
            skipped += 1
    return Discovery(rows, skipped, None), urljoin(base_url, parser.next_url) if parser.next_url else None


def discover(source: Source, fetcher, at: datetime) -> Discovery:
    """Failure aborts discovery and keeps old cursor. No live source runs in fixtures."""
    all_rows: list[Candidate] = []
    seen_urls: set[str] = set()
    skipped = 0
    page = source.index_url
    visited: set[str] = set()
    for _ in range(source.max_pages if source.adapter == "web" else 1):
        if page in visited:
            raise FetchError("pagination_loop")
        visited.add(page)
        final_url, body = fetcher.get(page, source)
        if source.adapter == "rss":
            result = parse_feed(body, source)
            next_url = None
        else:
            result, next_url = parse_index(body, final_url, source)
        skipped += result.skipped
        for item in result.items:
            if item.original_url not in seen_urls and len(all_rows) < source.max_items:
                seen_urls.add(item.original_url)
                all_rows.append(item)
        if not next_url or len(all_rows) >= source.max_items:
            break
        # Explicit host checks occur for each fetched page; no arbitrary off-site paging.
        page = next_url
    return Discovery(all_rows, skipped, at.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))


class BodyParser(HTMLParser):
    """Extract text only from article nodes, tracking actual open element names.

    A nesting depth alone is unsafe here: void tags (such as img) and unrelated
    closing tags must not make hidden navigation or script text public.
    """

    _IGNORED = {"script", "style", "nav", "footer", "form", "noscript", "template", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags: list[str] = []
        self.parts: list[str] = []
        self.published: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "meta" and (a.get("property") == "article:published_time" or a.get("name") == "datePublished"):
            self.published = self.published or _date(a.get("content"))
        if tag != "article" and not self.tags:
            return
        if tag not in VOID_TAGS:
            self.tags.append(tag)
        if tag == "time" and a.get("datetime"):
            self.published = self.published or _date(a["datetime"])

    def handle_data(self, data: str) -> None:
        if self.tags and not self._IGNORED.intersection(self.tags):
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in self.tags:
            # Ignore stray/mismatched closing tags rather than corrupting depth.
            del self.tags[len(self.tags) - 1 - self.tags[::-1].index(tag):]


def extract_body(html_text: str) -> tuple[str | None, str | None]:
    parser = BodyParser()
    parser.feed(html_text)
    text = " ".join(" ".join(parser.parts).split())
    return (text or None, parser.published)
