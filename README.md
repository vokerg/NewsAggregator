# NewsAggregator

**Статус: fixture-tested collector foundation (#8), Angular shell (#1) и synthetic-fixture News Reader (#2).** Это публичный репозиторий. Python CLI и offline-тесты коллектора существуют; Angular web-app scaffold добавлен, но реальные источники, production hosting/PWA, планировщик и LLM-пайплайн **ещё не реализованы**.

NewsAggregator — персональный агрегатор мировых новостей с возможностью смотреть не только **что произошло**, но и **что разные медиасреды считают важным**. Пользователь самостоятельно формирует реестр источников, включая официальные, независимые, ангажированные и пропагандистские медиа. Система должна показывать их повестку с атрибуцией, а не незаметно нормализовать её под единый «объективный» обзор.

*English:* A source-defined, perspective-aware personal news collector and reader. Its distinct product is the ability to reconstruct each media environment's editorial agenda without confusing that agenda with verified fact.

**Разграничение функций:** для отдельной новости сначала сохраняем оригинальный заголовок, доступный текст, ссылку и метаданные. **Автоматическое саммари каждой отдельной новости пока не делаем** — это только идея для будущего исследования. Сводки из *множества новостей* по заданному периоду и информационной перспективе остаются отдельной запланированной функцией.

**Клиентский стек (решено):** Angular (актуальная стабильная major-линия v22 на момент решения), mobile-first web application, адаптивная верстка для маленьких и больших экранов; установка на телефон через PWA — целевой сценарий. **Отдельное нативное приложение не входит в первый этап.** Сначала UI читает статические публичные данные, обновляемые через коммиты и публикацию сборки из этого GitHub-репозитория; отдельный backend для чтения новостей первоначально не требуется. [Фронтенд-архитектура](docs/FRONTEND.md).

## Два независимых вопроса

- **О чём новость?** Тема/событие и география самого события: например, атака на Керченский мост — событие об Украине/России.
- **Чьими глазами виден мир?** Медийная среда, в которой это событие получило внимание: например, датские СМИ могут сделать его одной из главных новостей Дании, хотя событие произошло не в Дании.

Это независимые фильтры, а не взаимозаменяемые теги. Начальные перспективы: Дания; Украина; Молдова; российские государственные/прокремлёвские медиа; российские независимые/либеральные медиа. География и язык издателя описываются отдельно.

## Предполагаемый путь данных

1. Источники выбираются **только из управляемого пользователем реестра**, с описанием перспективы, происхождения, языка и технического способа чтения.
2. Каждый источник обслуживает свой адаптер (RSS, публичный API, веб-страница; дополнительные платформы по необходимости). Ориентир — около **пяти циклов сбора в сутки** с индивидуальной частотой и наблюдаемым состоянием.
3. Оригинал/извлечённое содержимое и нормализованные записи логически разделены. У каждой новости есть внутренний ID, заголовок, длина текста, публикационная и сборочная метки времени, теги, ID источника и **прямая ссылка на оригинал**.
4. После завершения фиксированного временного окна формируется воспроизводимый снимок входных новостей. Время окончания агрегирования **не сдвигает** границы окна.
5. Экспериментальный многоэтапный LLM-пайплайн сначала получает метаданные/заголовки и выбирает ID материалов, затем читает тела только выбранных новостей и готовит сводки **внутри выбранной перспективы**.
6. Веб-интерфейс показывает как **все отдельные новости**, так и производные сводки: фильтры, теги, полный доступный текст, ссылка на оригинальный материал, охват/статусы.

## Документы

- [PROJECT_BIBLE.md](PROJECT_BIBLE.md) — проектное видение, продуктовые инварианты, концепции и границы.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — проектируемый поток данных, модели, временные окна, LLM и UI.
- [docs/FRONTEND.md](docs/FRONTEND.md) — решение по Angular, компонентной архитектуре, статическим ресурсам и responsive/PWA.
- [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md) — упорядоченный план проверок, нерешённые вопросы и критерии доказательств.
- [docs/COLLECTION.md](docs/COLLECTION.md) — работающий fixture-only CLI-коллектор, source registry, ограничения безопасности, тесты и результаты #8.
- [AGENTS.md](AGENTS.md) — контракт для следующих агентских сессий.
- [config/source_candidates.json](config/source_candidates.json) — кандидаты на первые источники; не рабочий реестр.

## Связанный проект

[War Reporter](https://github.com/vokerg/war_reporter) служит техническим референсом: отдельные Telegram/X/RSS/web-адаптеры, источник как объект реестра, provenance, NDJSON, состояние сбора и статический reader. **Не копировать его семантику войны, отчётов, временных зон или правил публикации автоматически.** В War Reporter публичный архив содержит лишь ограниченные проекции, а не полный исходный HTML/текст.

## Важно для публичного репозитория

Пожелание хранить исходные материалы **не равнозначно разрешению публиковать полный текст/HTML чужих статей**. Спроектировать разделение закрытого архива полного захвата и разрешённой публичной проекции; точная политика хранения/публикации требует отдельного решения. Не коммитить API-ключи, cookies, токены, приватные данные и полные неразрешённые копии стороннего контента.

## Следующий шаг

Angular scaffold, маршрутизация, тесты и сборка реализованы в #1. PWA и GitHub Pages **не развёрнуты и не проверены**. Reader реализован на синтетических примерах в #2; следующий UI-этап — фильтры (#3). Не считать фикстуру реальной новостной лентой.

Подтвердить первый источник и его URL, проверить на одном RSS- и одном web-источнике список заголовков, извлечение body, метки времени и повторяемость сохранения. Затем протестировать два этапа LLM на малом наборе с учётом цены и точности. Никаких утверждений о работающем сборе до фактического прогона.

## Collector foundation (issue #8)

Сбор RSS/Atom и HTML-index реализован как **библиотека + CLI**, а не как работающий автоматически сервис. В `config/sources.json` пока **нет включённых реальных источников**. Используйте синтетические offline-фикстуры; полный контракт и предостережения — в [docs/COLLECTION.md](docs/COLLECTION.md).

```bash
python -m unittest discover -s tests -v
python -m newsagg --registry tests/fixtures/registry.json \
  --fixture-map tests/fixtures/fixtures-map.json \
  --output .local/newsagg --at 2026-11-18T08:00:00Z
```

Live network требует явного `--live` и подтверждённого/включённого источника с проверенными robots/terms. Публичное хранилище содержит **только metadata**; сырой HTML и полный текст не публикуются. CI проверяет только фикстуры, не реальные publisher endpoints.

## Angular frontend — issue #1

A minimal, **read-only** Angular 22 shell is available in `src/` with a lazy news-feed route, responsive navigation, accessible empty/error/loading states, a reusable news card, and an injected typed static JSON repository. The committed `public/catalog/manifest.json` is a version-1 **synthetic reader fixture** with two invented items, not real news. This is not an operational or published reader and does not add a per-article LLM summary.

Pinned primary versions: Angular/CLI **22.2.6**, TypeScript **6.0.2**, Node **24.15.0** (or an officially supported Node 22/26 release). Angular 22 requires Node `^22.22.3 || ^24.15.0 || ^26.0.0`. See https://angular.dev/reference/versions. Node 22.16 is **too old** for Angular 22.

```bash
nvm use                     # Node 24.15.0 from .nvmrc
npm ci                      # Reproducible install from committed package-lock.json
npm run lint
npm run test:ci
npm run build:pages
npm start
```

The local development URL is `http://localhost:4200/#/news`. The production build sets `<base href="/NewsAggregator/">` and uses hash routes (`/NewsAggregator/#/news`) to avoid GitHub Pages history-mode deep-link 404s. The `build:pages` command checks *compile-time path configuration only*; neither publishing nor live Pages checks are enabled. There is no service worker, installable PWA, backend read API, real catalog, or ingestion scheduler. Unit tests use the Angular Vitest builder and mocked HTTP; GitHub Actions provides the compatible Node runtime for CI. The v1 catalog is a bounded metadata projection, not the collector's raw NDJSON schema; issue #4 must define and validate the producer-to-reader transformation. The renderer rejects unrecognized fields, invalid dates and unsafe publisher URLs.

Issue #2 implements fixture-driven article details. Future work: #4 implements partitioned read-model publishing and #5 addresses PWA installation and freshness. Do not treat the temporary fixture manifest as a production pagination format.

## Synthetic news reader — issue #2 (2026-11-22)

The read-only Angular app now demonstrates feed cards and routes such as `/#/news/demo-danish-001`, with a separate validated public detail document for each item. `public/catalog/manifest.json` intentionally contains **two invented example records**, one with original *project-authored* text and one with explicitly rights-unavailable text. Every page containing those records is labelled as a demonstration. The `example.org` publisher links are placeholders, **not** live articles. No real source has been enabled, collected or published.

The temporary v1 catalog remains bounded to 500 metadata records; optional `tags` maintain backward compatibility with previous v1 catalogs. Item IDs must be path-safe ASCII identifiers (letter/digit first, then letters/digits/hyphens/underscores). Each item references a `catalog/items/<id>.json` document that must match its ID. A detail document contains either:

- `body: { "kind": "available", "publication_basis": "synthetic|licensed|public_domain", "paragraphs": ["plain text"] }` for rights-reviewed text; or
- `body: { "kind": "unavailable", "reason": "rights|not_extracted|failed|unknown" }` when text cannot be shown.

These are **data assertions supplied by the producer**, not proof of a license. The publisher/producer must verify rights before a public file is generated; the browser rejects unsupported shapes, unexpected fields, unsafe URLs, oversized content and ID mismatches. No HTML is rendered from source data. `extraction_status: extracted` does not imply that the article body is publicly accessible. The original HTTPS URL remains available from both feed and detail, including when the separate body document is missing, invalid or fails to load.

Run `npm ci && npm run format:check && npm run lint && npm run test:ci && npm run build:pages` under the supported Node version in `.nvmrc`. CI tests the reader using synthetic HTTP fixtures and confirms JSON assets are copied by the build. A [pre-merge headless Chrome smoke check](https://github.com/vokerg/NewsAggregator/actions/runs/45328893165) additionally passed for the built reader at five viewport widths, including keyboard skip focus, deep-link reload and body-error recovery. This is **not** evidence of deployed Pages, physical-device tests, or live publisher access. Partitioning, producer-side rights enforcement, and real data remain #4 and source onboarding.

## Discovery and filters — issue #3

The Angular reader supports combinable, shareable URL filters on the synthetic catalog: **VIEW FROM** (media perspective), **ABOUT** (subject geography), source ID, language, publisher country, topic tag, editorial label and inclusive UTC date range. Date filtering and sorting use publication time when known, otherwise first-seen time. Missing classifications can be explicitly selected as unknown; no missing values are guessed. Sort modes are newest, oldest and source name.

The source browser at the hash route **/#/sources** lists publishers with items in the current public catalog and links to filtered feeds; it does not represent the full source registry or live ingestion. A GitHub Pages feed deep-link looks like **/NewsAggregator/#/news?view=dk-media&about=UA**. The URL preserves combinations and clearing selections removes their query parameters. The existing v1 catalog accepts optional validated language, publisher_country and editorial_labels metadata in addition to tags.

These remain **synthetic demonstration records**, not verified publisher classifications, a deployed website or a complete historical catalog. Source browsing and filtering operate only on the records in the current bounded read model; issue #4 owns partitioned/complete read-model publication.
