import { describe, expect, it } from "vitest";
import { parseCatalogIndex, parseIndexedPage } from "./catalog-index";

const index = {
  schema_version: 2,
  revision: "data-1234567890abcdef12345678",
  total_items: 1,
  pages: [{ day: "2026-11-18", part: 1, count: 1 }],
};

const item = {
  id: "dr-123",
  title: "Publisher headline",
  source_id: "dr",
  source_name: "DR",
  original_url: "https://www.dr.dk/nyheder/story",
  published_at: "2026-11-18T23:59:59Z",
  first_seen_at: "2026-11-19T01:00:00Z",
  perspective_ids: ["dk-media"],
  about_country_codes: [],
  extraction_status: "extracted",
};

describe("CatalogIndex", () => {
  it("accepts a consistent bounded day page", () => {
    const parsed = parseCatalogIndex(index);
    expect(parsed.schema_version).toBe(2);
    if (parsed.schema_version !== 2) throw new Error("expected v2 index");
    expect(
      parseIndexedPage(
        { schema_version: 1, revision: index.revision, items: [item] },
        parsed,
        parsed.pages[0],
      ).items,
    ).toEqual([item]);
  });

  it("rejects malformed dates, excessive page sizes and inconsistent totals", () => {
    expect(() => parseCatalogIndex({ ...index, total_items: 2 })).toThrow();
    expect(() => parseCatalogIndex({ ...index, coverage_status: "complete" })).toThrow();
    expect(parseCatalogIndex({ ...index, coverage_status: "partial" }).schema_version).toBe(2);
    expect(() =>
      parseCatalogIndex({
        ...index,
        pages: [{ day: "2026-02-30", part: 1, count: 1 }],
      }),
    ).toThrow();
    expect(() =>
      parseCatalogIndex({
        ...index,
        pages: [{ day: "../secret", part: 1, count: 1 }],
      }),
    ).toThrow();
    expect(() =>
      parseCatalogIndex({
        ...index,
        pages: [{ day: "2026-11-18", part: 1, count: 101 }],
        total_items: 101,
      }),
    ).toThrow();
  });

  it("rejects stale, misdated and unrecognized page data", () => {
    const parsed = parseCatalogIndex(index);
    if (parsed.schema_version !== 2) throw new Error("expected v2 index");
    const page = { schema_version: 1, revision: index.revision, items: [item] };
    expect(() =>
      parseIndexedPage({ ...page, revision: "old" }, parsed, parsed.pages[0]),
    ).toThrow();
    expect(() =>
      parseIndexedPage(
        { ...page, items: [{ ...item, published_at: "2026-11-19T00:00:00Z" }] },
        parsed,
        parsed.pages[0],
      ),
    ).toThrow();
    expect(() =>
      parseIndexedPage({ ...page, body: "secret" }, parsed, parsed.pages[0]),
    ).toThrow();
  });
});
