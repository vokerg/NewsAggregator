import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog-parser";

const article = {
  id: "dk-example-1",
  title: "Example headline",
  source_id: "dk-example",
  source_name: "Example publisher",
  original_url: "https://example.org/article",
  published_at: null,
  first_seen_at: "2026-11-18T08:00:00Z",
  perspective_ids: ["dk-media"],
  about_country_codes: ["UA"],
  extraction_status: "unavailable",
};

describe("parseCatalog", () => {
  it("validates an empty versioned catalog", () => {
    expect(
      parseCatalog({ schema_version: 1, revision: "empty", items: [] }).items,
    ).toEqual([]);
  });

  it("preserves VIEW FROM separately from ABOUT and original publisher URLs", () => {
    const result = parseCatalog({
      schema_version: 1,
      revision: "v1",
      items: [article],
    });
    expect(result.items[0]?.perspective_ids).toEqual(["dk-media"]);
    expect(result.items[0]?.about_country_codes).toEqual(["UA"]);
    expect(result.items[0]?.original_url).toBe("https://example.org/article");
    expect(result.items[0]?.published_at).toBeNull();
  });

  it("accepts optional tags but rejects unsafe IDs and unexpected metadata", () => {
    const fixture = {
      schema_version: 1,
      revision: "fixture",
      items: [{ ...article, tags: ["world"] }],
    };
    expect(parseCatalog(fixture).items[0]?.tags).toEqual(["world"]);
    expect(() =>
      parseCatalog({ ...fixture, items: [{ ...article, id: "../escape" }] }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        ...fixture,
        items: [{ ...article, extra: "not public" }],
      }),
    ).toThrow();
  });

  it("rejects coercible enum values, whitespace IDs and repeated tags", () => {
    for (const fields of [
      { extraction_status: ["extracted"] },
      { id: "demo-one\n" },
      { tags: ["world", "world"] },
    ]) {
      expect(() =>
        parseCatalog({
          schema_version: 1,
          revision: "fixture",
          items: [{ ...article, ...fields }],
        }),
      ).toThrow();
    }
  });

  it("accepts optional classification fields but rejects malformed or arbitrary fields", () => {
    const valid = {
      ...article,
      language: "da",
      publisher_country: "DK",
      editorial_labels: ["public-service"],
    };
    const catalog = {
      schema_version: 1,
      revision: "classifications",
      items: [valid],
    };
    expect(parseCatalog(catalog).items[0]?.language).toBe("da");
    expect(parseCatalog(catalog).items[0]?.publisher_country).toBe("DK");
    expect(parseCatalog(catalog).items[0]?.editorial_labels).toEqual([
      "public-service",
    ]);
    for (const field of [
      { language: ["da"] },
      { language: "English" },
      { publisher_country: "Denmark" },
      { editorial_labels: ["independent", "independent"] },
      { editor_notes: "not public" },
    ]) {
      expect(() =>
        parseCatalog({
          ...catalog,
          items: [{ ...valid, ...field }],
        }),
      ).toThrow();
    }
  });

  it("rejects unsupported versions and malformed data", () => {
    expect(() =>
      parseCatalog({ schema_version: 2, revision: "v2", items: [] }),
    ).toThrow();
    expect(() =>
      parseCatalog({ schema_version: 1, revision: "v1", items: [{}] }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        schema_version: 1,
        revision: "v1",
        items: [{ ...article, original_url: "javascript:alert(1)" }],
      }),
    ).toThrow();
  });
});

describe("catalog safety boundaries", () => {
  const fixture = { schema_version: 1, revision: "fixture", items: [article] };

  it("rejects extra raw body fields and unknown root keys", () => {
    expect(() =>
      parseCatalog({
        ...fixture,
        items: [{ ...article, body_text: "not licensed for publication" }],
      }),
    ).toThrow();
    expect(() =>
      parseCatalog({ ...fixture, access_token: "do-not-publish" }),
    ).toThrow();
  });

  it("rejects invalid dates while preserving an explicit unknown date", () => {
    expect(() =>
      parseCatalog({
        ...fixture,
        items: [{ ...article, published_at: "2026-02-30T10:00:00Z" }],
      }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        ...fixture,
        items: [{ ...article, first_seen_at: "2026-11-18" }],
      }),
    ).toThrow();
    expect(parseCatalog(fixture).items[0]?.published_at).toBeNull();
  });

  it("rejects unsafe publisher URLs and allows an ordinary original URL", () => {
    for (const original_url of [
      "http://example.org/article",
      "***example.org/article",
      "https://example.org:8443/article",
      "https://localhost/article",
      "https://127.0.0.1/article",
      "https://example.org/article?access_token=123",
      "https://example.org/article#session_id=123",
      "https://example.org/article?sessionKey=123",
    ]) {
      expect(() =>
        parseCatalog({
          ...fixture,
          items: [{ ...article, original_url }],
        }),
      ).toThrow();
    }

    const original_url = "https://example.org/article?edition=one#section-2";
    expect(
      parseCatalog({
        ...fixture,
        items: [{ ...article, original_url }],
      }).items[0]?.original_url,
    ).toBe(original_url);
  });

  it("rejects duplicate item IDs and oversized catalog pages", () => {
    expect(() =>
      parseCatalog({ ...fixture, items: [article, article] }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        ...fixture,
        items: Array.from({ length: 501 }, (_, index) => ({
          ...article,
          id: `example-${index}`,
        })),
      }),
    ).toThrow();
  });
});
