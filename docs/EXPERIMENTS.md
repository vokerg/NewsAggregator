# Research backlog and decisions

Проект на этапе проектирования. Каждая задача должна дать **наблюдаемое доказательство**, а не только предположение. До получения результатов не объявлять технологию принятой.

## Отложенная гипотеза: саммари каждой новости

Индивидуальное автоматическое саммари каждой статьи **не входит в первоначальный scope**. Не создавать отдельный LLM-вызов на каждую полученную новость и не делать такой summary обязательным для reader или хранилища. К исследованию этой функции возвращаться только по отдельному решению; не путать её с планируемым обзором **набора** публикаций за период и в заданной медиаперспективе.

## Зафиксированный технологический выбор — frontend

- **Angular:** одобрен как основной клиентский стек, mobile-first responsive web application, PWA как целевое installable поведение. Отдельное нативное приложение первоначально не делать.
- **Static-first / GitHub commits:** на старте публичные данные поступают из этого же репозитория как коммитируемые артефакты; сайт только читает версионированный статический read model. Выбор продвинутого backend отложен.
- **Engineering quality:** feature-first standalone-компоненты, Signals, OnPush, lazy-loaded маршруты, небольшие UI-компоненты, строгая типизация, тесты и доступность. См. [FRONTEND.md](FRONTEND.md).
- **Верификация ещё требуется:** Angular CLI build/test, GitHub Pages base href и deep links, Pages deployment, PWA installability/updates, чтение данных из manifest/index, производительность и мобильные экраны. Не считать эти возможности реализованными на основании принятого решения.

## Приоритет 0 — сначала подтвердить источники

1. **Первый кандидат из диктовки.** Исходная строка в config/source_candidates.json; выяснить точное наименование, URL и «русскую версию». Ничего не угадывать и не включать без подтверждения.
2. **Контрольная пара.** По одному реально доступному RSS/Atom и веб-источнику с пользовательским подтверждением; записать URL, способ discovery, body extraction, доступность publication time, ограничение частоты и licensing.
3. **Референс War Reporter.** Изучить collector_adapters, publisher_fetch, source lifecycle, error/health handling и публичную проекцию. Отдельно описать, какие модули можно переиспользовать без переноса войны/эмбарго/жёстких групп.

## Приоритет 1 — вертикальный технический эксперимент

4. **Discovery coverage.** Извлечь список headline + article URLs, пагинацию и время, сравнить с видимым веб-списком, измерить упущенные/дублированные элементы.
5. **Body retrieval.** Для фиксированных ID извлечь текст, язык, дату, длину; проверить недоступность, paywall и RSS-summary fallback. Никаких выдуманных тел.
6. **Стабильность ID.** Два повторных цикла с изменившимися headline/redirect проверяют дедупликацию, происхождение и идемпотентность.
7. **Окна времени.** На фиктивном таймлайне (пять сборов/сутки, долгая агрегация, сбой, late arrival, DST) доказать отсутствие пробелов и смещения границ.
8. **Мини-reader (Angular).** Список -> просмотр доступного текста -> оригинальная ссылка, фильтр по source/perspective/about, coverage.

## Приоритет 2 — небольшие LLM-проверки

9. **Headline selection.** На размеченном ручным просмотром наборе сделать headline-only pass. Измерить долю выбранных значимых материалов, потери из-за чанков, несуществующие IDs и сдвиг медиаповестки.
10. **Body synthesis.** Сравнить 2 и 3 прохода на одинаковом snapshot. Критерии: соответствует ли summary выбранной перспективе, все ли события привязаны к source IDs, не появились ли неатрибутированные утверждения, какова стоимость/латентность.
11. **Ранние теги.** Проверить извлечение topic/country/event tags на ingestion и качество отбора. Сохранить unknown и возможность исправить тег; не превращать автоматический тэг в достоверный факт.
12. **Cost model.** По каждому этапу зафиксировать item count, средние chars и tokens, prompt/completion/cache/batching, вызовы/день, текущий прайс **на дату проверки**, оценку при 5 циклах и 1 daily summary на перспективу; лимиты бюджета и graceful degradation.

## ChatGPT vs OpenAI API — различать

13. **Server-side API prototype.** Минимальный скрипт изолированно проверяет доступ к OpenAI API через переменную окружения (имя/секрет никогда не коммитить), структурированный ответ с IDs, usage и ошибками. Доступность API определяется ключом/биллингом и конкретной интеграцией; наличие ChatGPT в чате не доказывает, что приложение уже может исполнять такой код.
14. **ChatGPT operator workflow.** Отдельно проверить возможность управлять GitHub Actions/репозиторием из ChatGPT через подключённые инструменты без передачи API-ключа модели. War Reporter имеет документированный узкий operator flow, но он **не является** готовым публичным API или автоматической интеграцией NewsAggregator.
15. **Decision:** использовать API, ChatGPT-оператор или гибрид по итогам реального теста, цены, контроля доступов, ограничений выполнения и сопровождаемости.

## Приоритет 3 — эксплуатация и публичность

16. Права на полные тексты, RSS syndication terms, robots, политика хранения raw и видимость личного reader. Не публиковать в публичном репозитории full-text archive до решения.
17. Per-source health, retry/backoff/rate limits, error isolation, без ложного «всё собрано», бюджетные лимиты и исходные ссылки.
18. UX: навигация по источникам, стране события и медиаперспективе, обзоры, перевод и мультиязычность как опция.

## Журнал решений

| Статус | Решение | Основание |
| --- | --- | --- |
| Зафиксировано | Сохранять раздельно предмет новости и перспективу источника | Продуктовое требование |
| Зафиксировано | Не удалять индивидуальные публикации после сводки | Продуктовое требование |
| Зафиксировано | Прямой исходный URL для каждой новости | Продуктовое требование |
| Зафиксировано | ~5 сборов в сутки как стартовая цель, per-source strategy | Продуктовое требование |
| Зафиксировано | Конкретное закрытое окно важнее времени завершения агрегатора | Продуктовое требование |
| Гипотеза | NDJSON + отдельный индекс/reader | Нужен spike |
| Гипотеза | Два прохода headline selection -> body summary, возможен третий | Нужен сравнительный тест |
| Гипотеза | Europe/Copenhagen для дневных окон | Нужна явная конфигурация |
| Открыто | Первый source/URL, разрешения на body, API/operator, стек | Нужна проверка |

Добавлять сюда датированные краткие выводы со ссылками на тесты, реальные samples (без незаконной публикации full-text), measured cost и принятую/отклонённую гипотезу.

## Evidence — 2026-11-18, issue #8

Implemented a standalone Python 3.11+ standard-library ingestion foundation, with strictly opted-in live HTTPS mode and no enabled real sources. RSS/Atom and bounded HTML index adapters, strict metadata-only public projection, persistent per-source status/cadence/cursor, idempotent NDJSON, and offline GitHub Actions fixtures are provided. Local evidence: `python -m unittest discover -s tests -q` passed **25 tests**; two same-time synthetic CLI runs retained 4 unique public article IDs (`ok` then cadence `idle`), without external publisher traffic. **Not verified:** live DR/TV2/NewsMaker/Meduza extraction, actual rights, end-to-end schedule, deployments, or GitHub CI. Full contracts and War Reporter pattern review: [COLLECTION.md](COLLECTION.md). These are still research and follow-up decisions, not claims of production ingestion.

### 2026-11-22 — PR #13 self-review

Found and fixed HTML ignored-element nesting, optional body parser exception isolation, common query/fragment credential leakage, RSS 1.0 namespace handling and relative RSS/Atom links, publication dates from body-unavailable pages, and publication-time upgrades on retry. Added seven regression tests (25 → 32); the `offline-collector` job in GitHub Actions [run 44990763618](https://github.com/vokerg/NewsAggregator/actions/runs/44990763618) passed all 32 on Python 3.12 and repeated offline ingestion with 4 stable IDs. No real publisher network checks or source onboarding occurred. Details and limitations: [COLLECTION.md](COLLECTION.md).

## 2026-11-25 — static catalog v2 implementation evidence (#4 PR)

**Decision:** use a deterministic offline producer from strictly validated
public collector NDJSON, 100-item UTC date partitions, a bounded index and
individually addressable metadata files. Revisions are content-hashed rather
than derived from the publication job's wall clock. The browser never parses
the entire NDJSON archive and keeps its read-only data-access abstraction.
The generator deliberately refuses to release article bodies (including
`body_extraction_status=extracted`), unsupported item keys or local-only rows.

**Verification plan:** run `python -m unittest discover -s tests -v`,
`npm run format:check`, `npm run lint`, `npm run test:ci`,
`npm run build:pages`; CI additionally runs the offline fixture collector
twice, generates v2 assets and checks all generated article-body documents
are rights-unavailable. Tests exercise deterministic revision, stable URL,
capture-time perspective, 100-record boundaries, UTC midnight, rejection of
duplicates/secrets/unexpected fields, stale page/index revisions and older-ID
direct lookup.

**Not verified by implementation alone:** real committed publisher dataset,
data-revision publishing from a real collection, GitHub Pages configuration
or serving URL, live source accessibility, mobile-device or offline/PWA cache
freshness. Source-completeness measurements belong to source onboarding.
A passing local build is not a claim that a deployed site updated.

Additional exporter regressions reject cross-publisher links even when the
item hash is internally consistent, mismatched collector coverage totals, and
unrecognized status claims. The manifest shows `unknown` if no matching
status is supplied.

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


## 2026-11-27 — issue #5: PWA cache and update decision (PR #20)

**Decision:** adopt the Angular 22 service worker with a prefetched application
shell and **network-first** public catalog groups rather than cache-first
news data. The revisioned catalog manifest is bounded to one cached response
with a maximum age of 1 hour; discovery/partition/item metadata uses a
120-entry LRU with maximum age 1 day. Both groups wait at most 5 seconds for
the network before serving previously downloaded data; neither prefetches
the archive. Browser connectivity warnings are intentionally best-effort,
and missing offline records still fail via the existing retryable reader UI.
A detected application update triggers a full-page reload prompt, avoiding
mixing old application code with new lazy bundles.

**Observed verification:** GitHub Actions on PR #20, head
`d3547fc6281ffe1c9156cddf1ecc907798363ac2`:
[frontend checks](https://github.com/vokerg/NewsAggregator/actions/runs/45950359442)
passed format, lint, npm audit, **57 Angular unit tests** (including 3 new
offline/update notices tests), PWA config checks and Pages-path production
build; [validated static release](https://github.com/vokerg/NewsAggregator/actions/runs/45950359448)
passed both synthetic and generated v2 catalog build/rights checks and
verified compiled service-worker URL patterns against the Pages subpath;
[collector foundation](https://github.com/vokerg/NewsAggregator/actions/runs/45950359504)
passed its offline tests and fixture ingestion. This is build/CI evidence,
not a device or production installability test.

**Outstanding:** physical viewport/keyboard/assistive-tech evaluation,
real HTTPS installation on desktop/iOS/Android, online/offline update
transitions with actual service-worker lifecycle, Pages hosting/settings and
live publish/revision propagation. No live publisher data was collected or
published as part of this issue.
