import { DOCUMENT } from "@angular/common";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
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
});
