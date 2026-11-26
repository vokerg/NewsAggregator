import { convertToParamMap } from "@angular/router";
import { describe, expect, it } from "vitest";
import { NewsItem } from "../../core/models/news";
import {
  buildFilterOptions,
  DEFAULT_FEED_FILTERS,
  feedFilterQueryParams,
  filterNews,
  hasActiveFeedFilters,
  readFeedFilters,
  UNKNOWN_FILTER_VALUE,
} from "./news-filtering";

const items: readonly NewsItem[] = [
  {
    id: "dk",
    title: "Denmark covers Ukraine",
    source_id: "dr",
    source_name: "DR",
    original_url: "https://example.org/dk",
    published_at: "2026-11-18T23:30:00-05:00",
    first_seen_at: "2026-11-19T05:00:00Z",
    perspective_ids: ["dk-media"],
    about_country_codes: ["UA"],
    language: "da",
    publisher_country: "DK",
    tags: ["world"],
    editorial_labels: ["public-service"],
    extraction_status: "unavailable",
  },
  {
    id: "state",
    title: "State publisher covers Ukraine",
    source_id: "state",
    source_name: "State media",
    original_url: "https://example.org/state",
    published_at: "2026-11-20T01:00:00Z",
    first_seen_at: "2026-11-20T01:30:00Z",
    perspective_ids: ["ru-state-media"],
    about_country_codes: ["UA"],
    language: "ru",
    publisher_country: "RU",
    tags: ["politics"],
    extraction_status: "unavailable",
  },
  {
    id: "independent",
    title: "Independent publisher",
    source_id: "independent",
    source_name: "Independent media",
    original_url: "https://example.org/independent",
    published_at: null,
    first_seen_at: "2026-11-17T20:00:00Z",
    perspective_ids: ["ru-independent-media"],
    about_country_codes: ["RU"],
    language: "ru",
    tags: ["world"],
    editorial_labels: ["independent"],
    extraction_status: "unavailable",
  },
  {
    id: "unknown",
    title: "Not classified yet",
    source_id: "md",
    source_name: "Moldovan outlet",
    original_url: "https://example.org/md",
    published_at: null,
    first_seen_at: "2026-11-18T09:00:00Z",
    perspective_ids: ["md-media"],
    about_country_codes: [],
    extraction_status: "unavailable",
  },
];

const ids = (filters: Parameters<typeof filterNews>[1]) =>
  filterNews(items, filters).map((item) => item.id);

describe("news discovery filtering", () => {
  it("keeps ABOUT independent of VIEW FROM, including international coverage", () => {
    expect(ids({ ...DEFAULT_FEED_FILTERS, view: "dk-media" })).toEqual(["dk"]);
    expect(ids({ ...DEFAULT_FEED_FILTERS, about: "UA" })).toEqual([
      "state",
      "dk",
    ]);
    expect(
      ids({ ...DEFAULT_FEED_FILTERS, view: "dk-media", about: "DK" }),
    ).toEqual([]);
  });

  it("never merges Russian state and independent editorial perspectives", () => {
    expect(ids({ ...DEFAULT_FEED_FILTERS, view: "ru-state-media" })).toEqual([
      "state",
    ]);
    expect(
      ids({ ...DEFAULT_FEED_FILTERS, view: "ru-independent-media" }),
    ).toEqual(["independent"]);
  });

  it("intersects source, language, publisher country, editorial label and topic", () => {
    expect(
      ids({
        ...DEFAULT_FEED_FILTERS,
        about: "UA",
        source: "dr",
        language: "da",
        publisher: "DK",
        editorial: "public-service",
        tag: "world",
      }),
    ).toEqual(["dk"]);
    expect(
      ids({
        ...DEFAULT_FEED_FILTERS,
        source: "dr",
        language: "ru",
      }),
    ).toEqual([]);
  });

  it("allows explicit unknown classifications without inferring labels", () => {
    expect(
      ids({ ...DEFAULT_FEED_FILTERS, about: UNKNOWN_FILTER_VALUE }),
    ).toEqual(["unknown"]);
    expect(
      ids({ ...DEFAULT_FEED_FILTERS, publisher: UNKNOWN_FILTER_VALUE }),
    ).toEqual(["unknown", "independent"]);
    expect(
      ids({ ...DEFAULT_FEED_FILTERS, editorial: UNKNOWN_FILTER_VALUE }),
    ).toEqual(["state", "unknown"]);
    const options = buildFilterOptions(items, DEFAULT_FEED_FILTERS);
    expect(options.view.map((option) => option.value)).toContain("dk-media");
    expect(options.view.map((option) => option.value)).not.toContain("DK");
    expect(options.about.map((option) => option.value)).toContain(
      UNKNOWN_FILTER_VALUE,
    );
  });

  it("uses UTC day boundaries, falling back to first seen only for unknown publication", () => {
    expect(ids({ ...DEFAULT_FEED_FILTERS, from: "2026-11-19" })).toEqual([
      "state",
      "dk",
    ]);
    expect(
      ids({
        ...DEFAULT_FEED_FILTERS,
        from: "2026-11-18",
        to: "2026-11-18",
      }),
    ).toEqual(["unknown"]);
    expect(
      ids({
        ...DEFAULT_FEED_FILTERS,
        from: "2026-11-20",
        to: "2026-11-19",
      }),
    ).toEqual([]);
  });

  it("sorts by true zoned timestamp, with stable ties and source ordering", () => {
    expect(ids(DEFAULT_FEED_FILTERS)).toEqual([
      "state",
      "dk",
      "unknown",
      "independent",
    ]);
    expect(ids({ ...DEFAULT_FEED_FILTERS, sort: "oldest" })).toEqual([
      "independent",
      "unknown",
      "dk",
      "state",
    ]);
    expect(ids({ ...DEFAULT_FEED_FILTERS, sort: "source" })).toEqual([
      "dk",
      "independent",
      "unknown",
      "state",
    ]);
    expect(items[0]?.published_at).toBe("2026-11-18T23:30:00-05:00");
  });

  it("generates options from the entire catalog and retains stale URL selections", () => {
    const options = buildFilterOptions(items, {
      ...DEFAULT_FEED_FILTERS,
      tag: "not-present",
    });
    expect(options.tag.some((option) => option.value === "world")).toBe(true);
    expect(options.tag.some((option) => option.value === "not-present")).toBe(
      true,
    );
    expect(ids({ ...DEFAULT_FEED_FILTERS, tag: "not-present" })).toEqual([]);
  });
});

describe("feed filter URL state", () => {
  it("roundtrips combinations without conflating query parameter meanings", () => {
    const filters = {
      ...DEFAULT_FEED_FILTERS,
      view: "dk-media",
      about: "UA",
      source: "dr",
      language: "da",
      publisher: "DK",
      tag: "world",
      editorial: "public-service",
      from: "2026-11-19",
      to: "2026-11-20",
      sort: "oldest" as const,
    };
    const params = feedFilterQueryParams(filters);
    expect(readFeedFilters(convertToParamMap(params))).toEqual(filters);
    expect(hasActiveFeedFilters(filters)).toBe(true);
    expect(hasActiveFeedFilters(DEFAULT_FEED_FILTERS)).toBe(false);
    expect(feedFilterQueryParams(DEFAULT_FEED_FILTERS)["view"]).toBeNull();
  });

  it("rejects duplicated, excessive, invalid dates and unknown sort values", () => {
    const parsed = readFeedFilters(
      convertToParamMap({
        view: ["dk-media", "ru-state-media"],
        about: "UA",
        from: "2026-02-30",
        to: "2026-11-30",
        source: "x".repeat(129),
        sort: "random",
      }),
    );
    expect(parsed.view).toBe("");
    expect(parsed.about).toBe("UA");
    expect(parsed.from).toBe("");
    expect(parsed.to).toBe("2026-11-30");
    expect(parsed.source).toBe("");
    expect(parsed.sort).toBe("newest");
  });
});
