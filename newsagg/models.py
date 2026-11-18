"""Versioned, user-controlled publisher configuration and URL identity."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import ipaddress
from pathlib import Path
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ValidationError(ValueError):
    """Input is incompatible with the versioned collection contract."""


_SOURCE_ID = re.compile(r"^[a-z][a-z0-9-]{2,63}$")
_LANGUAGE = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
_COUNTRY = re.compile(r"^[A-Z]{2}$")
_SECRET = re.compile(
    r"(?i)(?:\b(?:api[_-]?key|access[_-]?token|token|authorization|bearer|password|secret)\s*[:=]\s*\S+|\bsk-[A-Za-z0-9_-]{12,})"
)
_SECRET_QUERY = {"key", "api_key", "apikey", "token", "access_token", "auth", "authorization", "password", "secret", "signature", "sig"}
_TRACKING = {"fbclid", "gclid", "mc_cid", "mc_eid"}


def utc_iso(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValidationError("timestamp must be timezone-aware")
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_timestamp(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return utc_iso(parsed)
    except (ValueError, TypeError):
        return None


def check_public_text(value: str, max_length: int = 500) -> str:
    if not isinstance(value, str) or len(value) > max_length:
        raise ValidationError("unsafe text length or type")
    if any(ord(char) < 32 and char not in "\n\t" for char in value):
        raise ValidationError("control characters in public text")
    if _SECRET.search(value):
        raise ValidationError("possible credential in public text")
    return value.strip()


def require_url(url: str) -> str:
    """Reject credential URLs; original article URLs are never silently rewritten."""
    if not isinstance(url, str) or not url or len(url) > 2048:
        raise ValidationError("invalid URL length")
    if any(ord(char) <= 32 or ord(char) == 127 for char in url):
        raise ValidationError("control or whitespace in URL")
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ValidationError("malformed URL") from exc
    if (parsed.scheme != "https" or not host or parsed.username is not None
            or parsed.password is not None or port not in (None, 443)):
        raise ValidationError("only credential-free HTTPS URLs on port 443 allowed")
    if host.lower() in {"localhost", "localhost.localdomain"} or host.lower().endswith((".local", ".internal")):
        raise ValidationError("non-public host")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and not ip.is_global:
        raise ValidationError("private IP URL")
    if any(k.casefold() in _SECRET_QUERY for k, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        raise ValidationError("sensitive query parameter")
    return url


def canonical_url(url: str) -> str:
    parsed = urlsplit(require_url(url))
    query = urlencode([(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                       if not k.lower().startswith("utm_") and k.lower() not in _TRACKING])
    path = parsed.path or "/"
    return urlunsplit(("https", parsed.netloc.lower().removesuffix(":443"), path, query, ""))


def item_id(source_id: str, canonical: str) -> str:
    digest = hashlib.sha256((source_id + "\n" + canonical).encode("utf-8")).hexdigest()[:24]
    return f"{source_id}-{digest}"


def _strings(value: Any, name: str, pattern: re.Pattern[str] | None = None) -> tuple[str, ...]:
    if not isinstance(value, list) or not value or any(not isinstance(v, str) or not v for v in value):
        raise ValidationError(f"{name} must be a nonempty string array")
    if pattern and any(not pattern.fullmatch(v) for v in value):
        raise ValidationError(f"invalid {name}")
    if len(set(value)) != len(value):
        raise ValidationError(f"duplicate {name}")
    return tuple(value)


@dataclass(frozen=True)
class Source:
    source_id: str
    display_name: str
    enabled: bool
    canonical_home_url: str
    index_url: str
    adapter: str
    publisher_country: str | None
    languages: tuple[str, ...]
    perspective_ids: tuple[str, ...]
    editorial_labels: tuple[str, ...]
    allowed_hosts: tuple[str, ...]
    cadence_minutes: int
    max_pages: int
    max_items: int
    extract_body: bool
    item_tag: str
    link_path_prefix: str
    rights_profile: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Source:
        allowed = {"source_id", "display_name", "enabled", "canonical_home_url", "index_url", "adapter",
                   "publisher_country", "languages", "perspective_ids", "editorial_labels", "allowed_hosts",
                   "cadence_minutes", "max_pages", "max_items", "extract_body", "item_tag",
                   "link_path_prefix", "rights_profile"}
        if not isinstance(data, dict) or set(data) != allowed:
            raise ValidationError("source fields must match v1 schema exactly")
        sid = data["source_id"]
        if not isinstance(sid, str) or not _SOURCE_ID.fullmatch(sid):
            raise ValidationError("invalid source_id")
        name = check_public_text(data["display_name"], 120)
        if not name:
            raise ValidationError("empty display_name")
        if type(data["enabled"]) is not bool or type(data["extract_body"]) is not bool:
            raise ValidationError("enabled and extract_body must be booleans")
        if data["adapter"] not in ("rss", "web"):
            raise ValidationError("unsupported adapter")
        home, index = require_url(data["canonical_home_url"]), require_url(data["index_url"])
        country = data["publisher_country"]
        if country is not None and (not isinstance(country, str) or not _COUNTRY.fullmatch(country)):
            raise ValidationError("invalid publisher_country")
        langs = _strings(data["languages"], "languages", _LANGUAGE)
        perspectives = _strings(data["perspective_ids"], "perspective_ids", _SOURCE_ID)
        labels = data["editorial_labels"]
        if not isinstance(labels, list) or any(not isinstance(v, str) or check_public_text(v, 80) != v for v in labels):
            raise ValidationError("invalid editorial_labels")
        hosts = _strings(data["allowed_hosts"], "allowed_hosts")
        for host in hosts:
            if host != host.lower() or not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", host):
                raise ValidationError("invalid allowed hostname")
        for url in (home, index):
            if not any(urlsplit(url).hostname == host or urlsplit(url).hostname.endswith("." + host) for host in hosts):
                raise ValidationError("configured URL host not allowlisted")
        for name, low, high in (("cadence_minutes", 5, 10080), ("max_pages", 1, 10), ("max_items", 1, 100)):
            if type(data[name]) is not int or not low <= data[name] <= high:
                raise ValidationError(f"{name} outside supported bounds")
        tag = data["item_tag"]
        if not isinstance(tag, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,24}", tag):
            raise ValidationError("invalid item_tag")
        prefix = data["link_path_prefix"]
        if not isinstance(prefix, str) or not prefix.startswith("/") or ".." in prefix or len(prefix) > 100:
            raise ValidationError("invalid link_path_prefix")
        if data["rights_profile"] not in ("unknown", "metadata_only", "licensed_text"):
            raise ValidationError("invalid rights_profile")
        return cls(sid, name, data["enabled"], home, index, data["adapter"], country, langs,
                   perspectives, tuple(labels), hosts, data["cadence_minutes"], data["max_pages"],
                   data["max_items"], data["extract_body"], tag, prefix, data["rights_profile"])


def load_registry(path: Path) -> tuple[str, list[Source]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or set(payload) != {"version", "timezone", "sources"} or type(payload["version"]) is not int or payload["version"] != 1:
        raise ValidationError("unsupported registry schema version")
    if not isinstance(payload["timezone"], str):
        raise ValidationError("invalid timezone")
    try:
        ZoneInfo(payload["timezone"])
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValidationError("unknown IANA timezone") from exc
    if not isinstance(payload["sources"], list):
        raise ValidationError("sources must be an array")
    sources = [Source.from_dict(row) for row in payload["sources"]]
    ids = [source.source_id for source in sources]
    if len(set(ids)) != len(ids):
        raise ValidationError("duplicate source_id")
    return payload["timezone"], sources
