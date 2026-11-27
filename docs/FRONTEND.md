# Frontend architecture decision — Angular / responsive / PWA

**Decision accepted 2026-11-18. Foundation scaffold implemented for #1 and synthetic-fixture reader for #2 (2026-11-22).** Angular shell, read-only static catalog fixture, lazy route and unit/CI configuration exist. **The PWA production build is configured (#5), but the hosted site, installability on devices, actual offline behavior, and live browser/device verification have not been established.**

## Product intent

The primary product is a **web application** that looks and works excellent on phone, tablet and wide desktop. No native mobile app in the initial scope; users may install the web app as a **PWA** when its infrastructure is implemented and validated. The same information architecture must work with touch and keyboard, portrait/landscape, dark/light preference and varying text size. Mobile is not a stripped-down feed: source attribution, tags, access to available article text and one-action original publisher link remain available.

## Chosen stack and engineering conventions

- **Angular**; target the latest stable, supported line at the time of scaffolding (as of 2026-11-18, **Angular v22**). Pin compatible CLI/core/compiler packages and check official version/Node/TypeScript compatibility; avoid a floating unverified package set.
- Standalone components by default; bootstrapApplication; route-level lazy loading through Angular Router; avoid NgModules unless a dependency requires one.
- **Feature-first directories**: keep each route, its child widgets, services and tests colocated, not enormous global `components/` and `services/` folders. One concept per file; external same-named `.ts/.html/.css`, adjacent `.spec.ts`.
- Component contracts: leaf/presentational components get typed `input()` state and emit `output()` events; orchestration belongs in a feature page/facade or repository. Split huge templates by single-responsibility widgets; avoid a monolithic `AppComponent`.
- Angular Signals/`computed()` for local derived UI state; `ChangeDetectionStrategy.OnPush`; template `@if`, `@for`, `@switch` with stable tracking; `inject()` for dependencies. Use RxJS/HttpClient at async boundaries as needed, not a global state library by default.
- Full TypeScript strict mode and Angular strictTemplates; test responsive states, routes, URL handling, empty/error/loading content, component behavior and accessibility. Never use `any` as a silent replacement for schema validation.

Reference guidance: https://angular.dev/style-guide , https://angular.dev/ai/develop-with-ai , https://angular.dev/reference/versions .

## Suggested feature boundaries (proposal, adapt when implementing)

```text
src/
  main.ts
  app/
    app.ts / app.html / app.css       # tiny application shell & router outlet
    app.config.ts                     # providers and DI
    app.routes.ts                     # lazy feature routes
    core/
      data-access/                    # typed read-only static-public-data port
      models/                         # stable display DTOs and schema version
      configuration/                  # deployment base path, locale, reading settings
    shared/
      ui/                             # only genuinely reusable small UI primitives
    features/
      news-feed/                      # news list, article card, filters, pagination
      news-detail/                    # available article body and original URL
      perspectives/                   # choose / switch media environment
      digests/                        # daily multi-article digests when implemented
      source-browser/                 # source provenance, labels, source filter
      status/                         # coverage and freshness
```

The structure is guidance, not permission to create placeholder services/features that have no use yet. Use names that match Angular's current style guide and Angular CLI output. Reusable generic design belongs in shared; domain model and business rules must not live in dumb card components.

## Static-first GitHub data architecture

**Initial source of truth:** committed public records in `vokerg/NewsAggregator`, plus generated derivatives, version-controlled with Git. The collector/aggregation pipeline commits normalized allowed-to-publish material. A build/publish job verifies dataset schemas and creates versioned **read models** consumed by Angular. Reader never writes back to GitHub and never holds GitHub or model API credentials.

Proposed public asset family (to validate; these are NOT existing files):

```text
public/catalog/manifest.json           # schema version, commit/data revision, timestamps
public/catalog/days/YYYY-MM-DD.json    # limited metadata pages / indexes
public/catalog/items/<id>.json         # safe display data or excerpt where permitted
public/catalog/sources.json            # source identity, perspectives, tags
public/catalog/digests/...             # future selected-period multi-item summaries
```

The browser should not load entire historical NDJSON archives or fetch repository API trees on every navigation. Transform/validate NDJSON into bounded, browser-friendly static JSON pages at publish time. Consider stable URLs, cache busting by data revision, optional content hashes/ETags, and migration/version policies. Missing body or inaccessible public full text is represented explicitly; do not fabricate text or publish restricted copyrighted originals.

In the Angular app define a typed interface such as `NewsReadRepository` for list/detail/source/read-model retrieval, backed initially by an `HttpClient` static-assets implementation. Keep selection/filtering, routing and display independent from whether a future implementation uses GitHub Pages, CDN or a backend. Source metadata is distinct from event geography.

### Commit-driven flow

```text
configured sources
  -> collectors and extraction (scheduled, separate)
  -> normalized + rights-filtered public records (Git commit)
  -> validation / build (CI)
  -> versioned static read-model + Angular build artifact
  -> static hosting / GitHub Pages (if enabled)
  -> responsive Angular reader (read-only)
```

For multi-article daily synthesis, a separate explicit pipeline may publish new digest artifacts through commits. **Do not add LLM per-article summaries** to the feed path. The exact schedule, data format and hosting workflow are not implemented yet.

### Deployment/base URL

GitHub Pages project sites commonly serve under `/NewsAggregator/`, not `/`. Configure and verify Angular `base href` and relative data URLs for the actual deployment. Angular Router history-mode deep links require host fallback; on GitHub Pages test direct reload of deep links, or deliberately choose hash routing until a robust fallback is implemented. Never hardcode production secrets or deployment hostname into view components.

Build output and Pages deployment are separate evidence: a passing compile does not prove the site URL works. CI should test a schema fixture, build and verify output on real artifact paths before a deployment claim. Git commits are the source of release/data revision; do not blindly equate a commit with successful Pages publication.

## Responsive UI / accessibility contract

- Mobile-first layout and CSS breakpoints by **content** rather than device models; test at ~320, 375, 768, 1024 and ≥1440 CSS px, landscape and dynamic font sizes. No horizontal scrolling of article cards; avoid fixed heights for long international headlines.
- Small: vertical news list, compact accessible filters (drawer/sheet only when warranted), safe-area-aware nav, comfortable touch targets. Large: optional sidebar for sources/perspectives and spacious reading column; prevent over-wide article body lines.
- Every card has publisher, date with timezone context, source perspective, optional tags and obvious `open original` link. Card/reader must not accidentally hide this outbound action. Show a distinct indication when body is unavailable.
- Semantic headings, real buttons/links, keyboard focus, accessible labels, reduced-motion preference, readable contrast, skeleton or stable loading layout and error/empty/offline states.
- Internationalized strings and original-language titles, Unicode support, proper timestamps, and future translations are separate derivative data, never overwrite the original.

## PWA design contract and remaining verification

Use Angular's first-party service worker (usually added with `ng add @angular/pwa`) only after the base app exists. Require a manifest, HTTPS deployment, complete real icon assets (not placeholders), installability checks on Android/iOS where supported and a clear update UX. Cache the app shell and bounded permitted resources; **do not silently freeze daily news** by treating commit-generated catalogs as immutable shell assets. Define network-first/freshness strategy and cache-size/retention policy for manifest and daily partitions; audit offline coverage accurately. Service workers are production concerns, not a shortcut for native apps.

Docs: https://angular.dev/ecosystem/service-workers/getting-started ; https://angular.dev/ecosystem/service-workers/config .

## Initial implementation acceptance criteria

1. Angular CLI scaffold checked into the repo with an actual reproducible install/build/test run and explicit Angular/Node versions; no fictitious coverage.
2. A lean shell, one lazy-loaded news-feed page and reusable news-card component; small feature folders, clear data-access abstraction. Actual empty state until real user-approved news fixtures exist.
3. A versioned static catalog fixture and valid source metadata interface; list/detail route with original URL and unavailable-body handling; no per-article summary.
4. Phone + desktop viewport tests and keyboard interactions; no horizontal overflow, sensible responsive hierarchy.
5. Pages project-path/deep-link behavior checked on build/preview and then on deployed URL; publication of live site remains a separately authorized/configured step.
6. Later PWA installability and freshness checks on actual devices; no claim of offline access before test.

The key quality bar: easy to add new feed/detail/sources features without growing a single component or coupling pages to the current storage mechanism.

## Foundation implementation note — 2026-11-22 (#1)

Implemented a minimal standalone Angular v22 shell with lazy `news` route, hash-based Pages-safe navigation, mobile-first responsive styles, visible focus/skip link, external template/style files, signals/computed + OnPush, and an injectable typed `NewsReadRepository`. The HTTP adapter resolves relative to `document.baseURI` and validates a versioned **empty** public metadata fixture. Dedicated tests cover schema rejection, distinct `about_country_codes` versus `perspective_ids`, original URL, absent published date, status/retry and navigation. Angular v22/Vitest + TypeScript 6.0.2 and Node 24.15.0 are pinned in `package.json`/`.nvmrc`.

The `build:pages` script specifies the project subpath; hash routing is an explicit interim deep-link strategy for GitHub Pages. The CI workflow checks output base URL and presence of the static fixture but does **not** deploy. Actual viewport measurements, keyboard traversal on devices, and Pages hosting must be recorded after a browser/deployment run. No PWA worker or live-feed integration is introduced.

### 2026-11-22 pre-merge review for #1

The interim catalog parser strictly allowlists metadata keys, checks explicit timestamp offsets and HTTPS publisher URLs, rejects duplicate IDs and pages exceeding 500 records, and never accepts arbitrary full-text/raw fields. This validates what the browser consumes; the future issue #4 still owns the authoritative producer-to-reader transformation and publication CI. The card displays UTC context for publication timestamps, while dark-mode links use a high-contrast color variable. The route test exercises lazy navigation, and static catalog requests are tested against a Pages subpath. GitHub Actions checks PRs and pushes to `main`, not an issue-specific branch.

## Reader implementation note — 2026-11-22 (#2)

A small lazy `news/:id` route uses the existing read-only repository interface. The feed keeps a visible original-publisher link and provides an internal detail link. The detail renders source-provided metadata (source ID, first-seen and publication timestamps, original URL, perspective, subject geography, optional tags and extraction status) and either rights-reviewed plain text or an explicit unavailable reason. There is no per-article AI summary and no client-side GitHub API.

The temporary v1 manifest supports optional `tags` for backwards-compatible schema evolution, strict path-safe IDs and a separate bounded `catalog/items/<id>.json` document, matched against the manifest's original metadata. Synthetic source and article fixtures power current UI/test behavior. The manifest revision `fixture-reader-v1` triggers a prominent invented-data notice in feed and detail. `example.org` links are illustrative, not working publisher URLs. Missing catalog IDs, malformed documents, network failures and lack of public-body rights are different UI states.

An explicit `publication_basis` marker controls the form of publicly presented text but **does not establish legal rights**. The producer (future #4) must enforce rights and validate any actual publishing. The reader renders plaintext through Angular interpolation, never as trusted HTML. Real capture remains separately rights-controlled.

**Evidence/limits:** targeted Angular parser, repository, card/feed and detail/route tests are included; GitHub Actions owns pinned-Node compile, lint, format, unit tests and Pages-subpath build. No live publisher smoke, physical-device testing, service worker, automated dataset publication, or deployed Pages check is claimed from this change.

### 2026-11-24 pre-merge review for #2

Strict string enum checks reject coercible JSON arrays; catalog identifiers reject surrounding whitespace and repeated tags are rejected to avoid duplicate Angular tracking keys. Article document errors now preserve validated metadata and the original link, with a distinct retryable text-load error (never accepted as a stored document state). Long tags wrap inside the narrow feed grid. Regression tests exercise these boundaries and navigation cancellation; the fixture asset check covers the actual detail files. These checks do not establish publishing rights or production deployment.

The [pre-merge browser review](https://github.com/vokerg/NewsAggregator/actions/runs/45328893165) passed against the production build served locally at `/NewsAggregator/` in headless Chrome (Playwright 1.58.2), at widths 320, 375, 768, 1024 and 1440 CSS pixels. It exercised feed links, keyboard skip-to-content focus, detail navigation and reload, unavailable text, intercepted body-request failure and retry, and absence of horizontal overflow or uncaught page errors. All 30 Angular tests also passed in that run. This is a browser smoke check, not a full accessibility audit, physical-device test or live Pages deployment. The temporary diagnostic workflow is not retained in the merged change; CI keeps the normal checks and the added detail-asset verification.

### Discovery/filtering slice (#3, 2026-11-24)

Pure filtering and query-parameter helpers power a small standalone Angular panel and lazy-loaded, catalog-derived source browser. The filter state is derived from the route's query parameters via Signals; bookmarks and browser back/forward preserve independent ABOUT and VIEW FROM selections. Every facet intersects the other selected facets, and unknown/unclassified source metadata is represented explicitly instead of inferred. No editorial label represents a factual truth verdict.

Date boundaries are inclusive UTC days using normalized zoned publication timestamps, with first-seen fallback when publication time is unknown. This release introduces no runtime API, publisher collector, static publisher registry, PWA, deployment or public-article rights claims. Test evidence lives on the issue #3 PR; physical-device accessibility checks and complete historical search require later validation.

## Read-model v2 pagination (#4, 2026-11-25)

Angular continues to consume the v1 bounded synthetic catalog for tests.
When the build includes a committed collector public archive, the static
publisher replaces the fixture with a v2 index and date-partitioned v1-format
pages (100 items maximum). The repository validates the index, page dates,
revision and per-item source metadata, and makes one page available at a time
through `loadCatalog(page)`. `?catalogPage=N` preserves navigation through
reloads while retaining other filters; filters apply across all indexed articles. Metadata lookup by safe stable ID allows
direct details for older items without querying every page.

The public body is always marked unavailable for collector-derived items,
irrespective of extraction success. These generated files are metadata
projections, not authenticated licensed text. The Pages workflow builds for
`/NewsAggregator/` and uses hash links; real Pages/deep-link deployment,
offline cache freshness and complete on-device accessibility checks are still
external verification tasks.

### Review corrections (issue #4)
The revision includes collection coverage and the format/page-size policy. The
compact `catalog/search.json` index contains only stable IDs, timestamps and
classification/source fields (no titles, publisher URLs or body text). It is
bounded by the archive limit and supports archive-wide facets, source counts,
date filtering and sorting. Only partitions containing the current 100 query
results are fetched (up to six concurrent requests); each selected record is
checked against the same revision's discovery row. The v2 reader derives its
unavailable-body state from revision-validated metadata, not a separate cached
body file. The exporter rejects invalid reader metadata and ambiguous encoded
credential fragments. The release workflow builds and validates generated v2
fixtures and the actual release catalog with the browser parsers, then gates
main-only upload/deployment on successful tests and artifact validation.
The compact index is downloaded as a single bounded file, not an unbounded raw
archive; further index sharding can be evaluated as the archive grows.

## Installable PWA implementation — issue #5 (2026-11-27)

The production-only Angular service worker caches the **app shell**, with icons
lazily cached, while public catalog paths use **bounded network-first** data
groups. The catalog pointer (manifest) has a 1-hour maximum cache age and the
search/partition/item family uses a 120-entry LRU cache with a 1-day maximum
age; both retry the live network first with a five-second timeout before
falling back to previously cached content. The UI explicitly warns when
offline and never claims an uncached article is available. The installation
manifest uses the Pages project subpath with hash navigation. Browser-controlled
service-worker version detection prompts for a full reload rather than
activating new application code inside the old running session. An unrecoverable
cache event also requests a reload.

The PNG icons are project-created graphic assets (not publisher logos).
The release jobs validate their real dimensions and check the emitted
ngsw.json, worker, icon assets, and configured catalog cache strategy.
Run `npm run test:pwa` to validate configuration without a browser. The
Angular unit tests cover update, unrecoverable and online/offline UI events.
Actual install prompts, WebKit/Chrome installation, physical devices,
deployed Pages configuration, offline navigation and viewport behavior
must still be checked in browsers before claiming that production installability
or accessible behavior is proven. Browser HTTP "online" status is only a
connectivity hint; a failed network request still displays the retry UI.

### Pre-merge PWA review corrections

The icons were regenerated after a binary integrity defect was found; CI now
checks every PNG chunk CRC, the end marker and decompressed pixel length.
The shell explicitly discloses possible cached news even when online and offers
an explicit refresh action that reloads the current route and revalidates the
catalog pointer. There is no automatic background polling. Browser/device
verification is deferred by request; the issue remains open for that work.
