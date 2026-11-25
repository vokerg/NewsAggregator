# Architecture notes — проектный контракт, не реализация

Статус: hypothesis-driven design, 2026-11-17. Читать вместе с PROJECT_BIBLE.md. Конкретные технологии и имена полей могут изменяться после экспериментов.

## 1. Логические компоненты

**Source registry -> scheduler/dispatcher -> per-source discovery adapter -> article/body extractor -> normalized item store -> optional tagging -> snapshot/window builder -> perspective-specific aggregation -> summaries -> reader/site.**

Сквозные подсистемы: health/error reporting; provenance/versioning; safe fetching; publication-rights policy; model cost ledger; reproducible exports. Сбор и LLM независимы: падение LLM не мешает сбору, а сбой одного источника не стирает остальные.

### Адаптеры

Контракт одного адаптера: source config + time/lookback/cursor -> обнаруженные публикации + диагностическая метаинформация + cursor candidate. Контракт extractor: item URL + publisher constraints -> optional title/body/media/date + extraction status. Разделить список ссылок и загрузку тела; для RSS можно получить тело напрямую или по ссылке; web индекс может требовать pagination. Не обещать исчерпывающий охват без доказательств. Ограничивать размер, скорость, редиректы, домены, таймауты, query/robots; запрещать обращения к внутренним адресам (SSRF). Без обхода платного доступа и технических защит.

Технические фрагменты для изучения (не автоматического импорта) из War Reporter: scripts/collector_adapters.py, scripts/publisher_fetch.py, scripts/collector_runtime.py, scripts/public_archive.py, config/sources.json, SOURCE_LIFECYCLE.md.

## 2. Предлагаемые модели (логические примеры)

Не финальная схема. Вариант source record:

~~~json
{
  "source_id": "example-dk-rss",
  "display_name": "Example publisher",
  "enabled": false,
  "feed_url": null,
  "canonical_home_url": null,
  "adapter": "rss",
  "publisher_country": "DK",
  "languages": ["da"],
  "perspective_ids": ["dk-media"],
  "editorial_labels": [],
  "topic_hints": [],
  "collection": {"cadence_minutes": 288, "extract_body": true},
  "provenance_notes": null
}
~~~

Техническая частота 288 минут — только иллюстрация пяти циклов за 24 часа, **не утверждённый cron**. Не задавать editorial label или trust автоматически из домена/языка.

Вариант нормализованной публикации:

~~~json
{
  "item_id": "stable-internal-id",
  "source_id": "example-dk-rss",
  "original_url": "https://example.invalid/article",
  "canonical_url": "https://example.invalid/article",
  "headline": "Original headline",
  "body_text_ref": null,
  "body_char_count": null,
  "published_at": null,
  "first_seen_at": "2026-11-17T12:00:00Z",
  "last_seen_at": "2026-11-17T12:00:00Z",
  "language": "da",
  "subject_country_codes": [],
  "topic_tags": [],
  "perspective_ids_at_capture": ["dk-media"],
  "extraction_status": "headline_only",
  "capture_sha256": null,
  "parser_version": "draft",
  "rights_profile": "unknown"
}
~~~

Устойчивый item_id можно строить из source_id + canonical platform ID или нормализованного canonical URL; выбор и миграции должны быть протестированы. URL обязателен для настоящего item; example.invalid выше — намеренно нерелевантная иллюстрация. Разделить текст оригинала, извлечённый plaintext, перевод, media refs и публичную проекцию. Число символов определяется явно (например, Unicode code points), null значит «не измерено», а не 0. Никогда не выдавать длину заголовка за длину тела.

У источника могут быть несколько перспектив, однако конкретная агрегированная сводка обязана фиксировать перспективу и явный перечень включённых source_id. Ручные source labels имеют автора/время/версию; LLM topic tags имеют модель/версию/уверенность или unknown.

## 3. Временная модель и курсоры

Время хранится в UTC, дневные границы вычисляются в **конфигурируемом IANA timezone**. Europe/Copenhagen — стартовая гипотеза, не зафиксированная настройка. Учитывать DST: календарный день не всегда равен 24 часам.

- **Collection run**: start/finish/status и успехи/ошибки каждого source_id; последний подтверждённый source cursor. Не сдвигать cursor неуспешного источника.
- **Snapshot**: фиксированный закрытый интервал [window_start, window_end), time-of-freeze, список item_id и версии сохранённых записей, coverage по источникам. Изменение содержимого источника после freeze не должно незаметно менять уже опубликованную сводку.
- **Aggregation run**: perspective_id, snapshot_id, выбранные ID, модель/промпты/версии, время начала/конца и статус. Индивидуальное состояние для каждого perspective_id + вида окна.
- **Cursor**: следующий неагрегированный window_start = window_end предыдущего **успешно закрытого** окна; не равен wall-clock времени конца обработки.

**Вход по датам:** основной продукт — обзор последнего полного местного календарного дня, если он ещё не агрегирован. Публикационное время (published_at) и время первого наблюдения (first_seen_at) могут задавать разные выборки. Начальная гипотеза: включение датированных новостей по published_at, но только тех, которые реально увидены до snapshot cutoff; недатированные видны по first_seen_at с флагом. Проверить на реальных источниках и зафиксировать один контракт. Поздно обнаруженные публикации сохранять в архиве и отдельно отмечать как late arrival; допускать явную пересборку snapshot версии, не молчаливое изменение прошлого.

Ретраи с тем же window_id должны быть идемпотентны; частичный результат отображать как partial, failed как failed, не считать отсутствующую новость «нулём». Сводка может быть завершена позже следующего сбора, но не перебирать окно заново из-за задержки. Для конкурентных запусков нужен lock/lease или single-writer; способ реализации ещё открыт.

## 4. Предлагаемая LLM-схема

**Важно:** описанные LLM-проходы относятся к **агрегации набора публикаций** для тематического/дневного обзора конкретной медиаперспективы. Это **не** обработка каждого входящего item с целью получить его индивидуальное саммари. На старте отдельный per-article summary не генерируется и не является обязательной частью модели данных или reader; возможность отдельного саммари — отложенная исследовательская гипотеза.

**Input catalog:** item_id, title, source_id, published_at?/first_seen_at, perspective_id, tags, body_char_count, extraction_status. Сначала алгоритмически/через промпт проверить полноту списка, chunks, дубликаты URL и бюджет.

**Pass A (selection):** на одном snapshot перспективы по headline+metadata получить структурированный результат, например:

~~~json
{
  "perspective_id": "ru-state-media",
  "selected_item_ids": ["id-1", "id-2"],
  "topic_groups": [{"label": "Экономика", "item_ids": ["id-1"]}],
  "unknown_or_unprocessed_ids": [],
  "selection_notes": "partial coverage possible"
}
~~~

Наличие ID в ответе валидируется локально против snapshot. Нельзя применять LLM-сгенерированную ссылку или новый неизвестный ID. Ограниченные списки и потери на чанках измерять, а не скрывать.

**Pass B (synthesis):** получить доступный body только для выбранных IDs, сохранив URL/provenance; summary по событиям/темам, значимости для данной медиасреды, ключевым акцентам, исходным ссылкам. Исключения/пропуски и headline-only items отражать в coverage.

**Pass C (optional):** структурная и атрибуционная проверка (ID, границы корпуса, ссылки, противоречия), если эксперимент докажет пользу. Не заставлять выбранную медийную повестку быть «объективной» по редакционным критериям: нужно точное описание того, что эта среда транслировала, с дистанцией к неподтверждённым утверждениям.

Промпты в будущем держать в version-controlled templates; входные статьи — недоверенные данные, запреты на prompt injection и на утечки ключей. Логировать model, tokens, pricing snapshot/estimate, latency, inputs IDs, prompt version, selected IDs, output version, errors без записи секретов и без нарушения прав на тексты.

## 5. Persistence и публикация

NDJSON рассматривается как прозрачный экспорт/архив, индексы по item_id и датам для UI можно реализовать отдельно. Предполагаемые группы, а не создаваемые здесь каталоги:

- source registry/version history;
- original capture (rights controlled; outside public git by default);
- normalized items + ingestion status;
- snapshot manifests;
- derived tags, clusters, selection and reports;
- public read model + site assets;
- source & aggregation health.

Не хранить в Git как обычные исходники секреты, неразрешённый full-text, пользовательские приватные данные, случайные response headers и raw errors. GitHub Pages/статическая выдача возможны для публичной проекции; **полнотекстовый личный reader** может потребовать другой механизм доступа/хранения. Не решать это копированием закрытого корпуса в публичный GitHub.

## 6. Клиент: Angular и статический publish contract

Принят **Angular static-first SPA** с mobile-first responsive layouts и целевым PWA-режимом. Публичные новости сначала хранятся в том же GitHub-репозитории и публикуются как версионированные статические read-model ресурсы после коммита. Начальный читатель не требует runtime backend и **никогда не получает GitHub write token**. Отдельное нативное приложение отложено.

Контракты feature-first Angular, маршруты, lazy loading, PWA, responsive accessibility, data adapter и GitHub Pages subpath — в [FRONTEND.md](FRONTEND.md). Collector и browser не разделяют внутреннюю модель данных без версионированной public projection. Нормализованные приватные body/HTML не попадают в публичную сборку автоматически.

### 6.1 Контракты UI (MVP)

Лента: дата, заголовок, медиаисточник, перспектива, предмет, теги, длина и статус извлечения, ссылка на оригинал. Детали: доступное body, статус полноты, все метаданные и отдельное действие «Открыть оригинал». Сводка: день, perspective_id, тематические группы и source-linked citations, количество просмотренных/выбранных, частичный охват. Состояние: last attempted/succeeded, ошибки без утечек, отставание источников.

Доступность исходного body **не равна** разрешению его публичной перепубликации; политика отображения зависит от rights_profile.

## 7. Проверки архитектурного инварианта

1. Датская перспектива включает важную датским СМИ международную новость; фильтр subject_country=DK не включает её ошибочно.
2. ru-state и ru-independent получают независимые подборки; кросс-перспективная сводка не создаётся неявно.
3. Весь набор source items сохраняется, даже если LLM выбрал 10 из 100.
4. Aggregation end time не меняет window end; повторный запуск идентичен при одном snapshot.
5. Неизвестное publication time не становится фиктивным.
6. Каждый item и summary evidence ID ведут к проверенному original_url.
7. Недоступность body и неполный crawl видимы как partial.
8. Публичный read model не раскрывает секреты или неразрешённый full text.

## 2026-11-25 — issue #4: commit-driven public read-model contract (PR)

The opt-in collector's `public/items.ndjson` is metadata-only, and is **not** loaded
by the browser. The offline, standard-library `python -m newsagg.publish`
step validates every public archive record against `validate_public_item`,
the configured source registry and source-rights policy. All rows remain in
the collector archive; this step only emits public display projections. Neither
raw HTML, publisher article bodies, body lengths, canonical URLs, local-only
research items nor credentials are emitted into the static read model.

The read model is `catalog/manifest.json` schema **v2**: a content-hash
`revision`, `total_items`, and ordered bounded page descriptors
`{day, part, count}`. Pages are `catalog/days/YYYY-MM-DD/N.json`, max 100
records each, with the strict v1 metadata item schema. Dates are UTC
publication dates, falling back to UTC first-seen date if unknown.
`catalog/metadata/<safe-id>.json` supports old-item deep links without
loading the whole archive, and `catalog/items/<safe-id>.json` explicitly
returns unavailable public body for collector output. All per-item links
retain the **original publisher URL** and per-item captured media perspective;
ABOUT is never guessed from publisher country. Records with unpublishable
rights or unknown publication status cannot acquire a public full text.

The existing synthetic v1 catalog remains supported for development until
a validated public archive is explicitly committed. A page is fetched only
when visited, and revisioned URLs force revalidation on data changes. Filters
and source counts apply only to the **currently loaded page**; global
server-side querying, daily aggregations, rights-controlled personal full-text
access and PWA offline caching remain separate follow-up work. Pagination,
metadata lookup and schema/index consistency are validated client-side.

The Pages workflow runs after a push to `main`, or manually. When a
reviewed `data/public/items.ndjson` is present in a commit, it generates
`public/catalog` in the build workspace, then builds and uploads a
GitHub Pages artifact for the `/NewsAggregator/` subpath. If there is no
committed dataset, the workflow retains the conspicuously labelled synthetic
fixture. GitHub Pages configuration and the deployed URL must be confirmed
on the actual site: CI/build success alone is **not** deployment evidence.

When a matching committed collector `status.json` accompanies the archive, the
publisher validates the status version, timestamps, source-ID set, row counts,
total item count and aggregate state before projecting only a
`coverage_status` enum into the manifest. Without verified status this field
is `unknown` (not a claim of completeness); the UI distinguishes unknown,
partial and failed collection. The producer also enforces the registry
publisher-host allowlist for original URLs.
