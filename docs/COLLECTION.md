# Source collection foundation — issue #8

The Python collector supports offline fixtures and manual live collection over the enabled sources in `config/sources.json`. The unresolved candidate stays in `config/source_candidates.json`.

## Prerequisites and verification

Requires **Python 3.11+**, a Unix environment with `fcntl` (tested locally with Python 3.11+ on Linux; GitHub Actions uses Python 3.12), and the standard library only. No package install, API credentials, browser dependencies, or GitHub write token.

```bash
python -m compileall -q newsagg tests
python -m unittest discover -s tests -v
python -m newsagg --registry tests/fixtures/registry.json \
  --fixture-map tests/fixtures/fixtures-map.json \
  --output .local/newsagg-fixtures --at 2026-11-18T08:00:00Z
# Same command a second time produces no duplicate public item IDs.
```

Fixture output goes to `.local/newsagg-fixtures/public/items.ndjson`, `.local/newsagg-fixtures/public/status.json`, and `.local/newsagg-fixtures/state.json`. Git ignores `.local/`. The fixture uses invented `.example.org` publishers.

Run the enabled live sources with `python -m newsagg --live --output .local/newsagg`. The CLI enforces robots rules for its own user agent on each destination. Publication and the Angular read-model transformation are tracked in issue #4.

## Danish sources

Both sources attribute coverage to `dk-media`, with publisher country `DK` and language `da`. Subject geography stays unknown until classified. Their cadence is 288 minutes per source. For an immediate repeat check, add `--force`.

- DR's **Kort nyt** feed returns 20 entries with individual permalinks, including full articles linked from that section. The extractor reads the primary `NewsArticle` body. On 2026-11-24, two live cycles each returned 20 readable bodies and zero skips. IDs, original URLs, headlines, publication dates and first-seen timestamps matched across both cycles. The short-news index exposed 14 distinct short-news permalink anchors, 13 of which were in the collected snapshot. Coverage is limited to the feed window for that section. [DR Nyheder RSS](https://www.dr.dk/nyheder/service/feeds/allenyheder) · [Kort nyt index](https://www.dr.dk/nyheder/seneste)
- The TV 2 collector reads up to 50 entries from the publisher's RSS and follows links to `nyheder.tv2.dk`. It extracts the main article's editorial text blocks, excluding embeds, teasers, headers and footers. For syndicated items, the archive retains the TV 2 permalink even if the page names a regional partner's canonical URL. The dated permalink anchors in the **Seneste** index overlapped with 10 of the 50 feed entries in a separate snapshot on 2026-11-24. The index exposed 27 such anchors. [TV 2 Nyheder RSS](https://feeds.services.tv2.dk/api/feeds/nyheder/rss) · [Seneste index](https://nyheder.tv2.dk/seneste)

Article text is parsed in memory. The local archive records metadata and body character counts. Publisher republication rights remain unverified.

The combined live runs started at 18:50:55 and 18:52:32 UTC on 2026-11-24. Each run discovered and extracted 20 DR items and 50 TV 2 items with zero skips or errors. All 70 IDs, URLs, headlines, publication times and first-seen times matched across runs. DR body lengths ranged from 89 to 1,478 characters and TV 2 body lengths ranged from 137 to 11,093 in the first combined run.

## NewsMaker and Meduza

- NewsMaker has two independent RSS windows of 10 items each. The registry tracks Russian and Romanian separately, so translation links can coexist and each edition keeps its own language. Both have publisher country `MD` and perspective `md-media`. The extractor reads the current post and skips articles appended by infinite scroll. On 2026-11-24, all 10 permalinks from each feed were present in the corresponding homepage snapshot. NewsMaker's republication rules exclude aggregators from its partial-republication exception. [Russian feed](https://newsmaker.md/ru/feed) · [Romanian feed](https://newsmaker.md/ro/feed) · [Publisher rules](https://newsmaker.md/ru/pravovaya-informacziya)
- The Russian Meduza feed returns 30 items, covering news and features. Meduza is registered in Riga, so the registry uses publisher country `LV`, Russian language and perspective `ru-independent-media`. The extractor uses the article's editorial container and excludes recommendations, embeds and sharing controls. On 2026-11-24, all 30 permalinks in a feed snapshot appeared on the homepage, with 21 news items and nine features. The homepage for the English edition advertises a separate feed that stays outside this registry. Meduza describes CC BY exceptions for particular sets of articles. The collector applies the same metadata-only handling across the feed. [Russian feed](https://meduza.io/rss/all) · [English feed](https://meduza.io/rss/en/all) · [Publisher rules](https://meduza.io/pages/contacts)

The first five-feed live run started at 18:59:13 UTC on 2026-11-24 and completed in about 141 seconds. It extracted all 120 discovered bodies with zero skips or errors, including 10 per NewsMaker edition and 30 from Meduza. Body lengths ranged from 1,671 to 5,394 characters for Russian NewsMaker, from 1,641 to 5,995 for Romanian NewsMaker, and from 517 to 12,101 for Meduza.

## Ukrainian sources and Rossiya 24

- **Suspilne Novyny** is the primary Ukrainian reference. The Institute of Mass Information (IMI) placed it above 95% in its third-quarter 2026 standards review, which sampled 100 news items per outlet. The publisher's editorial rules require visible corrections, and the European Commission's 2026 Ukraine report describes Suspilne as editorially independent. The collector reads up to 20 current items from the publisher's Ukrainian RSS, with national and regional coverage. [IMI monitoring](https://imi.org.ua/monitorings/novyny-pid-chas-vijny-analiz-standartiv-onlajn-media-v-tretomu-kvartali-2026-roku) · [Editorial rules](https://corp.suspilne.media/media/documents/protokoli-pravlinnya/redaktsiini_zasady_informatsiinoho_movlennia_PAT_%C2%ABNSTU%C2%BB.pdf) · [European Commission report](https://enlargement.ec.europa.eu/document/download/c817ca8c-4ddf-405d-896a-40becd42924a_en?filename=ukraine-report-2026.pdf) · [Publisher RSS](https://suspilne.media/rss/ukrnet.rss)
- **UNIAN** is included for comparison with the `corroboration-needed` editorial label. IMI put it below 50% in the same sample. The aggregate findings describe the outlet's practices during the monitoring period. The collector reads up to 20 items from its main Ukrainian edition. Hromadske, Babel and Ukrainska Pravda also exceeded 95% and are candidates for a second reference. [IMI monitoring](https://imi.org.ua/monitorings/novyny-pid-chas-vijny-analiz-standartiv-onlajn-media-v-tretomu-kvartali-2026-roku) · [UNIAN publisher RSS](https://rss.unian.net/site/news_ukr.rss) · [UNIAN terms](https://www.unian.ua/static/siterules)
- **Rossiya 24** carries the `state-owned` and `propaganda` editorial labels and the `ru-state-media` perspective. The EU lists it among Kremlin-backed outlets subject to broadcasting restrictions. The collector samples up to 10 episodes of **Факты**, a programme listed on the official channel page. It reads HTML listings and episode pages for the original title, permalink, upload date when available, and the broadcaster's own description. The source covers this programme's archive. No stream, video, audio, or transcript is retrieved or stored. [Official channel](https://smotrim.ru/channel/3) · [Programme archive](https://smotrim.ru/brand/40925) · [EU Council listing](https://www.consilium.europa.eu/en/policies/sanctions-against-russia-explained/)

Rossiya 24 uses the `local_only` profile. Its records go to `research/items.ndjson` under the chosen local output directory. The ordinary `public/items.ndjson` and `public/status.json` exclude that source. CLI status includes both archives. The research archive is for personal monitoring and is excluded from the public projection.

Two targeted live runs on 2026-11-24 at 19:10:34 and 19:11:57 UTC each collected 20 UNIAN articles, 20 Suspilne articles, and 10 Rossiya 24 episode records with zero skips or source errors. The repeat run saved titles, upload dates and publisher descriptions for all 10 episodes. The 50 IDs, original URLs, titles and dates were stable across runs. Archive validation confirmed that all 10 Rossiya 24 records were confined to the research output.

## Registry contract (`config/sources.json`, version 1)

The root is `{ "version": 1, "timezone": "Europe/Copenhagen", "sources": [] }`. Each source row requires **exactly** these typed fields:

| Field(s) | Meaning |
| --- | --- |
| `source_id`, `display_name`, `enabled` | Stable lowercase provenance identity, publisher label and opt-in switch. Disable, do not silently rename, an established source ID. |
| `canonical_home_url`, `index_url`, `allowed_hosts` | HTTPS origins and an explicit exact/suffix publisher allowlist for link discovery, article retrieval, redirects and pagination. No userinfo, sensitive query parameters/fragments or non-443 ports. |
| `adapter`, `item_tag`, `link_path_prefix` | `rss` (RSS 1.0, RSS 2.0 or Atom), `web` (bounded HTML index), or `rossiya24-episodes` (the programme archive and its episode metadata). Web index tag and link prefix are configurable. |
| `publisher_country`, `languages`, `perspective_ids`, `editorial_labels` | Distinct publisher properties: country is ISO alpha-2 or null; languages and perspectives are distinct required lists; editorial labels describe provenance, **not** factual truth. |
| `cadence_minutes`, `max_pages`, `max_items` | Per-source cadence gate (288 minutes means five *opportunities* per 24h), bounded index requests (1–10), bounded candidates (1–100). A caller still has to invoke the CLI. |
| `extract_body`, `rights_profile` | Optional in-memory body extraction and `unknown`, `metadata_only`, `licensed_text`, or `local_only` handling. Full article text is excluded from the collector's archives. The `local_only` profile keeps source records and status out of the public projection. |

Unknown fields, duplicate IDs, invalid timezone and unsafe URLs fail schema validation. Existing source IDs remain in the registry when disabled; historical rows retain the original perspective and editorial labels at capture. The synthetic fixture registry is for testing only.

## Contracts and flow

1. `discover(source, fetcher, at)` returns `Discovery(items: Candidate[], skipped, cursor_candidate)`. `Candidate` is exactly original article URL, original headline and an optional normalized UTC publication time. RSS/Atom links (including namespaced RSS 1.0 and relative article links) and web-index `<article>` anchors can be missing or invalid; those candidates are recorded as skipped, not invented. A malformed feed fails the source. Web pagination follows `rel=next` within source limits and the fetch policy. This is **not** proof of full-site coverage.
2. For each discovered candidate, optionally call `extract_body(html)` on the linked publisher article. Extraction returns `(text | None, published_at | None)` in memory. If `<article>` cannot be found, the body is unavailable. HTTP error/robots denial yields `failed` body extraction without deleting the headline record. No paywall bypass or article-by-article LLM summary.
3. `make_item` builds a strict version-1 **public metadata projection**. ID is `<source_id>-<first 24 hex SHA256(source_id + newline + canonical_url)>`. `original_url` retains the exact link; canonical URL drops the fragment and recognized tracking parameters. Changing other query parameters changes identity. `published_at` may be **null**; `first_seen_at` and `last_seen_at` are observed UTC, never substituted for publication time. `about_country_codes: []` explicitly means unknown geography, even if the outlet is Danish. `perspective_ids_at_capture` is source attribution. Public rows never contain captured article text/HTML, response headers, raw payload, exception strings, cookies, credentials or direct API keys; `body_char_count` is present only for successfully extracted bodies.
4. `run(registry, fetcher, output, now, force=False)` gates collection by per-source cadence, isolates source failures and merges by stable ID. A repeat preserves `first_seen_at`, initial original URL and attribution, updates `last_seen_at`, and can upgrade failed/not-requested body extraction to extracted. Status values are `ok`, `partial`, `failed`, `idle`, per-source counts are `discovered`, `extracted`, `skipped`, with **enumerated** safe error codes. A source cursor is a successful cycle timestamp / advisory watermark, **not** a feed pagination token; it advances **only on `ok`**, never on partial/failed. Discovery deliberately does not discard older published entries based on this watermark, protecting late arrivals.
5. A Unix file lock protects one writer. Existing NDJSON and JSON state are parsed and validated before writing. Items, state and status use temporary files, fsync and atomic replace. Archives are written before state so interruption may require a retry to reconcile status. A populated output directory rejects changes that would move a previously collected source between the public and research archives.

## Network policy (live mode only)

- All requests use HTTPS:443, no credentials in URLs, cookies, proxies, or Authorization headers. Explicit host allowlist checked at **every redirect**. DNS is resolved and **all** returned IP addresses must be public; live HTTPS transport connects to a vetted IP while TLS verifies the original hostname, preventing a second unvalidated DNS resolution. Non-public hosts are rejected.
- `robots.txt` is requested safely and parsed per host with `urllib.robotparser`. A 404 allows access; robots retrieval errors/non-200 deny. The initial URL **and every redirect target** are checked *before* fetching target content. A disallow does not get fetched.
- Max 4 redirects, 8s per socket operation (the OS DNS lookup is not separately time-bounded), 1 MB/body, at least 1s between same-host requests; one bounded retry on 429/503 with capped `Retry-After`. No interactive login or protection bypass. Only XML/HTML/plain text MIME types are accepted; HTML parsing is deliberately minimal. Live retry and real-site legal/coverage verification are **not** asserted from mocks.
- Generated records accept only allowlisted keys and reject suspicious credential-looking strings in public headlines and original links; public errors record categories, not raw exception messages. This reduces accidental leaks, but no offline filter can promise to detect arbitrary secrets embedded in normal-looking editorial text. Review generated changes before committing to a public repo.

## Evidence and limitations — 2026-11-18

Local fixture run: `python -m compileall -q newsagg tests` passed; `python -m unittest discover -s tests -v` **25 tests passed**; two consecutive CLI fixture runs returned `ok` then `idle` and maintained **4 unique items** (2 RSS + 2 HTML index), without duplicates. Unit tests exercise RSS, Atom, undated items, HTML body extraction, bad links, stable URL identity, per-source fault isolation, partial extraction, pagination, cadence, malformed NDJSON, public projection rejection, private/mixed DNS, robots failure/disallow, redirect rejection, content size/MIME, rate limit and retry cadence. Tests use fake network transport; **no live publisher smoke was performed** and no production deploy was attempted. The later 2026-11-22 review CI run is recorded below.

Known bounds: HTML `<article>` extraction and index link patterns are purposely simple, not production-ready selectors for each target site. Language currently defaults to the first source language; multi-language sources need per-item detection/metadata in their **own** adapter issue. Neither RSS and web extraction nor fixed page limits guarantee coverage. This collector does not preserve copyrighted full-text bodies across processes; secure rights-controlled capture needs its own backend and policy. No automatic daily snapshots, LLM pass, statically paginated Angular catalog, published deployment, or self-running schedule is included.

### War Reporter reuse evaluation

Reviewed `vokerg/war_reporter` current `README.md`, `METHODOLOGY.md`, `SOURCE_LIFECYCLE.md`, `scripts/collector_adapters.py`, `scripts/publisher_fetch.py`, `scripts/collector_runtime.py`, `scripts/collector_common.py`, `scripts/public_archive.py`, and `config/sources.json`. Reuse *patterns*: stable source IDs and tombstones, per-source adapters, public-only projections, bounded publisher retrieval with per-hop safety, idempotent collection, isolated statuses and safe error categories. Do **not** copy War Reporter's platform-specific Telegram/X adapters, OSINT group/trust taxonomy, 24/72-hour military embargoes, geolocation handling, `Europe/Kyiv` windows, or digest/report process: they are not NewsAggregator requirements. Source code was implemented independently using only the Python standard library.

## Follow-up boundaries

GitHub Actions runs offline fixtures. Scheduling, publication and integration with the Angular catalog are separate work.


## Self-review and hosted verification — 2026-11-22

A second code and security review of [PR #13](https://github.com/vokerg/NewsAggregator/pull/13) found and fixed these issues before merge:

- Body extraction previously used an approximate tag depth, allowing nested void elements inside ignored HTML to suppress subsequent visible article text. The parser now tracks actual open tags; regression tests cover ignored navigation/scripts and malformed nesting.
- An unexpected exception in optional body parsing could discard a valid discovered headline by failing the entire source. Such failures now leave headline metadata intact, report `partial` and use a safe `body_unavailable` code.
- Sensitive names such as `session_id`, `client_secret`, `refreshToken`, `X-Amz-Signature`, and token-bearing URL fragments were not reliably rejected. Common variants now fail closed; arbitrary secrets embedded in opaque content still cannot be exhaustively detected.
- RSS 1.0 RDF namespace handling was incorrect, and relative RSS/Atom article links were silently skipped. Both are now parsed and regression-tested.
- When an article has publication metadata but no readable body, its date is still retained and source coverage is marked `partial`. A later retry can fill a previously unknown date and upgrade extraction status without changing the original item ID, first-seen time or first captured perspective.
- `AGENTS.md` no longer incorrectly describes the fixture-tested foundation as entirely unimplemented.

**Observed GitHub Actions evidence:** the `Collector foundation / offline-collector` PR workflow, [run 44990763618](https://github.com/vokerg/NewsAggregator/actions/runs/44990763618), completed successfully on 2026-11-22 against review head `3528f343f4f8cc28e2a37a7e6eca05765512c1bf`. Logs show **32 tests passed** on Python 3.12, no test failures, and consecutive fixture CLI results `ok` then `idle` with **4 unique items**. Documentation-only commits after this review must still get their own green head check before merge.

A full wall-clock DNS timeout and stricter article parsing require a separate production readiness check before enabling live source collection. Remaining limitations are intentionally out of scope: no live publisher smoke, per-source production selectors/language detection, verified rights policy, hosted collection schedule, full-text private archive, or guaranteed multi-file transaction. The advisory cursor is not a feed pagination token. The static public projection contains no body text, but metadata publishing still requires operator review.
