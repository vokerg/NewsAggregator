# Frontend architecture decision — Angular / responsive / PWA

**Decision accepted 2026-11-18.** This is an implementation contract and migration-friendly architecture target, **not an assertion that Angular code, a deployed website or a working PWA exists yet**.

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

## PWA roadmap (target, not done)

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
