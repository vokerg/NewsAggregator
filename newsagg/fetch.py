"""Bounded HTTPS fetch with per-hop publisher, DNS and robots controls.

A transport is injected for deterministic tests. Live transport pins the vetted IP
on connect while verifying TLS against the original hostname (no DNS rebinding).
"""
from __future__ import annotations

from dataclasses import dataclass
import http.client
import ipaddress
import socket
import ssl
import time
from typing import Callable
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from .models import Source, ValidationError, require_url


class FetchError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes
    headers: dict[str, str]


def public_ips(host: str, resolver: Callable[[str], list[str]]) -> list[str]:
    try:
        ips = resolver(host)
        if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
            raise FetchError("unsafe_destination")
        return ips
    except (OSError, ValueError) as exc:
        raise FetchError("dns_error") from exc


def system_resolver(host: str) -> list[str]:
    return list(dict.fromkeys(row[4][0] for row in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)))


class HttpsTransport:
    """No proxies, cookies, authentication, or automatic redirect handling."""
    def __call__(self, url: str, ip: str, timeout: float, max_bytes: int) -> Response:
        parsed = urlsplit(url)
        hostname = parsed.hostname
        assert hostname

        class PinnedConnection(http.client.HTTPSConnection):
            def connect(self) -> None:
                sock = socket.create_connection((ip, 443), timeout=self.timeout)
                try:
                    self.sock = self._context.wrap_socket(sock, server_hostname=hostname)
                except Exception:
                    sock.close()
                    raise

        conn = PinnedConnection(hostname, timeout=timeout, context=ssl.create_default_context())
        try:
            target = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
            conn.request("GET", target, headers={"Host": hostname, "User-Agent": "NewsAggregator-fixture-first/1.0", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html, text/plain, */*"})
            resp = conn.getresponse()
            body = resp.read(max_bytes + 1)
            headers = {key.lower(): value for key, value in resp.getheaders()}
            return Response(resp.status, body, headers)
        except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
            raise FetchError("network_error") from exc
        finally:
            conn.close()


class SafeFetcher:
    def __init__(self, *, transport: Callable[[str, str, float, int], Response] | None = None,
                 resolver: Callable[[str], list[str]] = system_resolver,
                 clock: Callable[[], float] = time.monotonic,
                 sleeper: Callable[[float], None] = time.sleep,
                 timeout: float = 8.0, max_bytes: int = 1_000_000,
                 min_interval: float = 1.0, max_redirects: int = 4,
                 retries: int = 1):
        if not (0 < timeout <= 30 and 0 < max_bytes <= 2_000_000 and 0 <= min_interval <= 60
                and 0 <= max_redirects <= 5 and 0 <= retries <= 2):
            raise ValueError("unsafe fetch limits")
        self.transport = transport or HttpsTransport()
        self.resolver = resolver
        self.clock = clock
        self.sleeper = sleeper
        self.timeout = timeout
        self.max_bytes = max_bytes
        self.min_interval = min_interval
        self.max_redirects = max_redirects
        self.retries = retries
        self._last: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser | None] = {}

    @staticmethod
    def _check_host(url: str, source: Source) -> str:
        try:
            require_url(url)
        except ValidationError as exc:
            raise FetchError("unsafe_url") from exc
        host = urlsplit(url).hostname or ""
        if not any(host == allowed or host.endswith("." + allowed) for allowed in source.allowed_hosts):
            raise FetchError("cross_publisher_host")
        return host

    def _single(self, url: str, source: Source) -> Response:
        host = self._check_host(url, source)
        ips = public_ips(host, self.resolver)
        elapsed = self.clock() - self._last.get(host, float("-inf"))
        if elapsed < self.min_interval:
            self.sleeper(self.min_interval - elapsed)
        self._last[host] = self.clock()
        result = self.transport(url, ips[0], self.timeout, self.max_bytes)
        if len(result.body) > self.max_bytes:
            raise FetchError("oversized_response")
        return result

    def _follow(self, url: str, source: Source, *, check_robots: bool = False) -> tuple[str, Response]:
        for index in range(self.max_redirects + 1):
            if check_robots and index > 0 and not self._robots_allowed(url, source):
                raise FetchError("robots_disallowed")
            response = self._single(url, source)
            if response.status not in (301, 302, 303, 307, 308):
                return url, response
            location = response.headers.get("location")
            if not location:
                raise FetchError("redirect_error")
            url = urljoin(url, location)
            self._check_host(url, source)
        raise FetchError("redirect_error")

    def _robots_allowed(self, url: str, source: Source) -> bool:
        host = self._check_host(url, source)
        if host not in self._robots:
            robots_url = f"https://{host}/robots.txt"
            try:
                _, result = self._follow(robots_url, source)
                if result.status == 404:
                    self._robots[host] = None
                elif result.status != 200 or len(result.body) > 128_000:
                    raise FetchError("robots_unavailable")
                else:
                    parser = RobotFileParser()
                    parser.parse(result.body.decode("utf-8", errors="replace").splitlines())
                    self._robots[host] = parser
            except FetchError as exc:
                raise FetchError("robots_unavailable") from exc
        parser = self._robots[host]
        return True if parser is None else parser.can_fetch("NewsAggregator-fixture-first", url)

    def get(self, url: str, source: Source) -> tuple[str, str]:
        self._check_host(url, source)
        if not self._robots_allowed(url, source):
            raise FetchError("robots_disallowed")
        for attempt in range(self.retries + 1):
            final_url, result = self._follow(url, source, check_robots=True)
            if result.status in (429, 503) and attempt < self.retries:
                header = result.headers.get("retry-after", "")
                delay = min(5.0, max(1.0, float(header))) if header.isdigit() else float(attempt + 1)
                self.sleeper(delay)
                continue
            if result.status != 200:
                raise FetchError("rate_limited" if result.status == 429 else "http_error")
            content_type = result.headers.get("content-type", "text/plain").split(";", 1)[0].strip().lower()
            if content_type not in {"text/html", "text/plain", "application/xml", "text/xml", "application/rss+xml", "application/atom+xml"}:
                raise FetchError("unsupported_content_type")
            return final_url, result.body.decode("utf-8-sig", errors="replace")
        raise FetchError("rate_limited")
