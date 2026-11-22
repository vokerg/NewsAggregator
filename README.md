# NewsAggregator

**Статус: fixture-tested collector foundation (#8) и базовый Angular shell (#1).** Это публичный репозиторий. Python CLI и offline-тесты коллектора существуют; Angular web-app scaffold добавлен, но реальные источники, production hosting/PWA, планировщик и LLM-пайплайн **ещё не реализованы**.

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

Angular scaffold, маршрутизация, тесты и сборка реализованы в #1. PWA и GitHub Pages **не развёрнуты и не проверены**. Следующий UI-этап — reader и фильтры в отдельных issues; не считать пустую фикстуру реальной новостной лентой.

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

A minimal, **read-only** Angular 22 shell is available in `src/` with a lazy news-feed route, responsive navigation, accessible empty/error/loading states, a reusable news card, and an injected typed static JSON repository. The committed `public/catalog/manifest.json` is a version-1 **empty fixture**, not real news. This is not an operational or published reader and does not add a per-article LLM summary.

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

Future work: issue #2 implements article detail and fixture-driven reader semantics, #4 implements partitioned read-model publishing, and #5 addresses PWA installation and freshness. Do not treat the temporary empty manifest as a production pagination format.
