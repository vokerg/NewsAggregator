import { ParamMap, Params } from "@angular/router";
import { DiscoveryItem } from "../../core/models/news";

/** A separate unknown selection avoids mistaking missing classifications for a country. */
export const UNKNOWN_FILTER_VALUE = "~unknown";

export type FacetKey =
  | "view"
  | "about"
  | "source"
  | "language"
  | "publisher"
  | "tag"
  | "editorial";

export type FeedSort = "newest" | "oldest" | "source";

export interface FeedFilters {
  readonly view: string;
  readonly about: string;
  readonly source: string;
  readonly language: string;
  readonly publisher: string;
  readonly tag: string;
  readonly editorial: string;
  readonly from: string;
  readonly to: string;
  readonly sort: FeedSort;
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

export type FilterOptions = Readonly<Record<FacetKey, readonly FilterOption[]>>;

export const DEFAULT_FEED_FILTERS: FeedFilters = {
  view: "",
  about: "",
  source: "",
  language: "",
  publisher: "",
  tag: "",
  editorial: "",
  from: "",
  to: "",
  sort: "newest",
};

const FILTER_QUERY_KEYS = {
  view: "view",
  about: "about",
  source: "source",
  language: "lang",
  publisher: "publisher",
  tag: "tag",
  editorial: "label",
  from: "from",
  to: "to",
  sort: "sort",
} as const;

function isValidUtcDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** The URL is untrusted input. Invalid or duplicated parameters are ignored. */
export function readFeedFilters(params: ParamMap): FeedFilters {
  const get = (key: string): string => {
    const values = params.getAll(key);
    const value = values.length === 1 ? (values[0] ?? "") : "";
    return value.length <= 128 && value.trim() === value ? value : "";
  };

  const from = get(FILTER_QUERY_KEYS.from);
  const to = get(FILTER_QUERY_KEYS.to);
  const sort = get(FILTER_QUERY_KEYS.sort);
  return {
    view: get(FILTER_QUERY_KEYS.view),
    about: get(FILTER_QUERY_KEYS.about),
    source: get(FILTER_QUERY_KEYS.source),
    language: get(FILTER_QUERY_KEYS.language),
    publisher: get(FILTER_QUERY_KEYS.publisher),
    tag: get(FILTER_QUERY_KEYS.tag),
    editorial: get(FILTER_QUERY_KEYS.editorial),
    from: isValidUtcDate(from) ? from : "",
    to: isValidUtcDate(to) ? to : "",
    sort:
      sort === "oldest" || sort === "source" || sort === "newest"
        ? sort
        : "newest",
  };
}

export function feedFilterQueryParams(filters: FeedFilters): Params {
  return {
    view: filters.view || null,
    about: filters.about || null,
    source: filters.source || null,
    lang: filters.language || null,
    publisher: filters.publisher || null,
    tag: filters.tag || null,
    label: filters.editorial || null,
    from: filters.from || null,
    to: filters.to || null,
    sort: filters.sort === "newest" ? null : filters.sort,
  };
}

export function hasActiveFeedFilters(filters: FeedFilters): boolean {
  return Object.entries(filters).some(
    ([key, value]) => key !== "sort" && value !== "",
  );
}

function matches(value: string, classifications: readonly string[]): boolean {
  if (!value) return true;
  if (value === UNKNOWN_FILTER_VALUE) return classifications.length === 0;
  return classifications.includes(value);
}

/** Dates use publication time when known; otherwise first-seen. All days are UTC. */
export function filterNews<T extends DiscoveryItem>(
  items: readonly T[],
  filters: FeedFilters,
): readonly T[] {
  const filtered = items.filter((item) => {
    const day = new Date(item.published_at ?? item.first_seen_at)
      .toISOString()
      .slice(0, 10);
    return (
      matches(filters.view, item.perspective_ids) &&
      matches(filters.about, item.about_country_codes) &&
      matches(filters.source, [item.source_id]) &&
      matches(filters.language, item.language ? [item.language] : []) &&
      matches(
        filters.publisher,
        item.publisher_country ? [item.publisher_country] : [],
      ) &&
      matches(filters.tag, item.tags ?? []) &&
      matches(filters.editorial, item.editorial_labels ?? []) &&
      (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to)
    );
  });

  return filtered.sort((a, b) => {
    const first = Date.parse(a.published_at ?? a.first_seen_at);
    const second = Date.parse(b.published_at ?? b.first_seen_at);
    if (filters.sort === "source") {
      return (
        a.source_name.localeCompare(b.source_name) ||
        second - first ||
        a.id.localeCompare(b.id)
      );
    }
    return (
      (filters.sort === "oldest" ? first - second : second - first) ||
      a.id.localeCompare(b.id)
    );
  });
}

const FACET_KEYS: readonly FacetKey[] = [
  "view",
  "about",
  "source",
  "language",
  "publisher",
  "tag",
  "editorial",
];

function valuesFor(item: DiscoveryItem, key: FacetKey): readonly FilterOption[] {
  switch (key) {
    case "view":
      return item.perspective_ids.map((value) => ({ value, label: value }));
    case "about":
      return item.about_country_codes.map((value) => ({ value, label: value }));
    case "source":
      return [{ value: item.source_id, label: item.source_name }];
    case "language":
      return item.language
        ? [{ value: item.language, label: item.language }]
        : [];
    case "publisher":
      return item.publisher_country
        ? [{ value: item.publisher_country, label: item.publisher_country }]
        : [];
    case "tag":
      return (item.tags ?? []).map((value) => ({ value, label: value }));
    case "editorial":
      return (item.editorial_labels ?? []).map((value) => ({
        value,
        label: value,
      }));
  }
}

/** Options are derived from the full current catalog, never from guessed labels. */
export function buildFilterOptions(
  items: readonly DiscoveryItem[],
  filters: FeedFilters,
): FilterOptions {
  const options = {} as Record<FacetKey, readonly FilterOption[]>;
  for (const key of FACET_KEYS) {
    const found = new Map<string, string>();
    let hasUnknown = false;
    for (const item of items) {
      const values = valuesFor(item, key);
      if (values.length === 0) hasUnknown = true;
      for (const value of values) found.set(value.value, value.label);
    }

    const values = Array.from(found, ([value, label]) => ({
      value,
      label,
    })).sort(
      (a, b) =>
        a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
    );

    if (hasUnknown) {
      values.push({
        value: UNKNOWN_FILTER_VALUE,
        label: "Unknown / unclassified",
      });
    }
    const selected = filters[key];
    if (selected && !values.some((option) => option.value === selected)) {
      values.push({
        value: selected,
        label:
          selected === UNKNOWN_FILTER_VALUE
            ? "Unknown / unclassified"
            : selected + " (not in catalog)",
      });
    }
    options[key] = values;
  }
  return options;
}
