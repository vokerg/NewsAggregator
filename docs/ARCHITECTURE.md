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

## 6. Контракты UI (MVP)

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
