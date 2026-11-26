import { DOCUMENT } from "@angular/common";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { DEFAULT_FEED_FILTERS } from "../models/news-filtering";
import { StaticNewsRepository } from "./static-news-repository";

const item = {
  id: "demo-one",
  title: "Example headline",
  source_id: "demo",
  source_name: "Synthetic publisher",
  original_url: "https://example.org/article",
  published_at: null,
  first_seen_at: "2026-11-18T08:00:00Z",
  perspective_ids: ["dk-media"],
  about_country_codes: ["UA"],
  tags: ["international"],
  extraction_status: "extracted",
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: DOCUMENT,
        useValue: { baseURI: "https://example.org/NewsAggregator/" },
      },
    ],
  });
  return {
    repository: TestBed.inject(StaticNewsRepository),
    http: TestBed.inject(HttpTestingController),
  };
}

describe("StaticNewsRepository", () => {
  it("requests the catalog relative to the document base URL", () => {
    const { repository, http } = setup();
    let revision: string | undefined;

    repository
      .loadCatalog()
      .subscribe((catalog) => (revision = catalog.revision));

    const request = http.expectOne(
      "https://example.org/NewsAggregator/catalog/manifest.json",
    );
    expect(request.request.method).toBe("GET");
    request.flush({ schema_version: 1, revision: "fixture", items: [] });
    http.verify();
    expect(revision).toBe("fixture");
  });

  it("reads only the exact selected ID from the public article document", () => {
    const { repository, http } = setup();
    let title: string | undefined;
    let text: string | undefined;
    repository.loadArticle("demo-one").subscribe((article) => {
      title = article?.item.title;
      text =
        article?.body.kind === "available"
          ? article.body.paragraphs[0]
          : undefined;
    });

    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 1,
        revision: "fixture-reader-v1",
        items: [item],
      });
    const detail = http.expectOne(
      "https://example.org/NewsAggregator/catalog/items/demo-one.json",
    );
    expect(detail.request.method).toBe("GET");
    detail.flush({
      schema_version: 1,
      item_id: "demo-one",
      body: {
        kind: "available",
        publication_basis: "synthetic",
        paragraphs: ["Original synthetic content"],
      },
    });
    http.verify();
    expect(title).toBe("Example headline");
    expect(text).toBe("Original synthetic content");
  });

  it("keeps the original URL when the body request fails", () => {
    const { repository, http } = setup();
    let result: unknown;
    repository.loadArticle("demo-one").subscribe((value) => (result = value));
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 1,
        revision: "fixture",
        items: [item],
      });
    http
      .expectOne(
        "https://example.org/NewsAggregator/catalog/items/demo-one.json",
      )
      .flush(null, { status: 404, statusText: "Not Found" });
    http.verify();
    expect(result).toEqual({
      item,
      revision: "fixture",
      body: { kind: "load_error" },
    });
  });

  it("returns null for an unknown item without requesting a detail asset", () => {
    const { repository, http } = setup();
    let result: unknown;
    repository
      .loadArticle("../not-an-item")
      .subscribe((value) => (result = value));
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 1,
        revision: "fixture",
        items: [item],
      });
    http.verify();
    expect(result).toBeNull();
  });

  it("rejects conflicting body text but retains validated metadata", () => {
    const { repository, http } = setup();
    let result: unknown;
    repository.loadArticle("demo-one").subscribe((value) => (result = value));
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 1,
        revision: "fixture",
        items: [{ ...item, extraction_status: "failed" }],
      });
    http
      .expectOne(
        "https://example.org/NewsAggregator/catalog/items/demo-one.json",
      )
      .flush({
        schema_version: 1,
        item_id: "demo-one",
        body: {
          kind: "available",
          publication_basis: "synthetic",
          paragraphs: ["Should not be public"],
        },
      });
    http.verify();
    expect(result).toEqual({
      item: { ...item, extraction_status: "failed" },
      revision: "fixture",
      body: { kind: "load_error" },
    });
  });
  it("loads only the selected v2 day partition and exposes pagination", () => {
    const { repository, http } = setup();
    let result: unknown;
    repository.loadCatalog(1).subscribe((catalog) => (result = catalog));
    const revision = "data-1234567890abcdef12345678";
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 2,
        revision,
        total_items: 2,
        pages: [
          { day: "2026-11-19", part: 1, count: 1 },
          { day: "2026-11-18", part: 1, count: 1 },
        ],
      });
    http
      .expectOne(
        `https://example.org/NewsAggregator/catalog/days/2026-11-18/1.json?rev=${revision}`,
      )
      .flush({ schema_version: 1, revision, items: [item] });
    http.verify();
    expect(result).toEqual({
      schema_version: 1,
      revision,
      items: [item],
      page_info: {
        page: 1,
        total_pages: 2,
        total_items: 2,
        coverage_status: "unknown",
      },
    });
  });

  it("loads an older v2 article by ID without downloading the archive", () => {
    const { repository, http } = setup();
    let result: unknown;
    const revision = "data-1234567890abcdef12345678";
    repository.loadArticle(item.id).subscribe((article) => (result = article));
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 2,
        revision,
        total_items: 1,
        pages: [{ day: "2026-11-18", part: 1, count: 1 }],
      });
    http
      .expectOne(
        `https://example.org/NewsAggregator/catalog/metadata/${item.id}.json?rev=${revision}`,
      )
      .flush({ schema_version: 1, revision, items: [item] });
    http.expectNone((request) => request.url.includes("/catalog/items/"));
    http.verify();
    expect(result).toEqual({
      item,
      revision,
      body: { kind: "unavailable", reason: "rights" },
    });
  });

  it("queries older partitions by combined facets without loading irrelevant pages", () => {
    const { repository, http } = setup();
    const revision = "data-1234567890abcdef12345678";
    const older = {
      ...item,
      id: "older",
      source_id: "older-source",
      source_name: "Older publisher",
      first_seen_at: "2026-11-17T08:00:00Z",
    };
    const compact = ({
      id,
      source_id,
      source_name,
      published_at,
      first_seen_at,
      perspective_ids,
      about_country_codes,
      tags,
    }: typeof item) => ({
      id,
      source_id,
      source_name,
      published_at,
      first_seen_at,
      perspective_ids,
      about_country_codes,
      tags,
    });
    let result: unknown;
    repository
      .loadCatalog(0, {
        ...DEFAULT_FEED_FILTERS,
        source: "older-source",
        about: "UA",
      })
      .subscribe((catalog) => (result = catalog));
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 2,
        revision,
        total_items: 2,
        pages: [
          { day: "2026-11-18", part: 1, count: 1 },
          { day: "2026-11-17", part: 1, count: 1 },
        ],
      });
    http
      .expectOne(
        `https://example.org/NewsAggregator/catalog/search.json?rev=${revision}`,
      )
      .flush({
        schema_version: 2,
        revision,
        rows: [compact(item), compact(older)],
      });
    http
      .expectOne(
        `https://example.org/NewsAggregator/catalog/days/2026-11-17/1.json?rev=${revision}`,
      )
      .flush({
        schema_version: 1,
        revision,
        items: [older],
      });
    http.verify();
    expect(result).toMatchObject({
      items: [older],
      discovery: [compact(item), compact(older)],
      page_info: { total_items: 2, total_matching: 1, total_pages: 1 },
    });
  });

  it("retains failed coverage in an empty v2 result", () => {
    const { repository, http } = setup();
    const revision = "data-1234567890abcdef12345678";
    let result: unknown;
    repository
      .loadCatalog(0, DEFAULT_FEED_FILTERS)
      .subscribe((catalog) => (result = catalog));
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 2,
        revision,
        total_items: 0,
        pages: [],
        coverage_status: "failed",
      });
    http
      .expectOne(
        `https://example.org/NewsAggregator/catalog/search.json?rev=${revision}`,
      )
      .flush({ schema_version: 2, revision, rows: [] });
    http.verify();
    expect(result).toMatchObject({
      items: [],
      page_info: { total_items: 0, total_pages: 0, coverage_status: "failed" },
    });
  });

  it("refuses a revision mismatch before loading article text", () => {
    const { repository, http } = setup();
    let error: unknown;
    const revision = "data-1234567890abcdef12345678";
    repository
      .loadArticle(item.id)
      .subscribe({ error: (err) => (error = err) });
    http
      .expectOne("https://example.org/NewsAggregator/catalog/manifest.json")
      .flush({
        schema_version: 2,
        revision,
        total_items: 1,
        pages: [{ day: "2026-11-18", part: 1, count: 1 }],
      });
    http
      .expectOne(
        `https://example.org/NewsAggregator/catalog/metadata/${item.id}.json?rev=${revision}`,
      )
      .flush({ schema_version: 1, revision: "wrong", items: [item] });
    http.verify();
    expect(error).toBeInstanceOf(Error);
  });
});
