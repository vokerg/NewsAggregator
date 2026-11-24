import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { NEWS_READ_REPOSITORY } from "../../core/data-access/news-read-repository";
import { NewsItem } from "../../core/models/news";
import {
  SourceBrowserPage,
  summarizeCatalogSources,
} from "./source-browser.page";

const item: NewsItem = {
  id: "one",
  title: "Example",
  source_id: "publisher",
  source_name: "Example publisher",
  original_url: "https://example.org/one",
  published_at: null,
  first_seen_at: "2026-11-18T08:00:00Z",
  perspective_ids: ["dk-media"],
  about_country_codes: ["UA"],
  extraction_status: "unavailable",
};

describe("SourceBrowserPage", () => {
  it("groups catalog items by durable source ID, retaining perspectives", () => {
    expect(
      summarizeCatalogSources([
        item,
        { ...item, id: "two", perspective_ids: ["md-media"] },
      ]),
    ).toEqual([
      {
        id: "publisher",
        name: "Example publisher",
        count: 2,
        perspectives: ["dk-media", "md-media"],
      },
    ]);
  });

  it("shows catalog-derived source links and a synthetic-data warning", () => {
    TestBed.configureTestingModule({
      imports: [SourceBrowserPage],
      providers: [
        provideRouter([]),
        {
          provide: NEWS_READ_REPOSITORY,
          useValue: {
            loadCatalog: () =>
              of({
                schema_version: 1,
                revision: "fixture-sources",
                items: [item],
              }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SourceBrowserPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain("Demonstration data only");
    expect(element.textContent).toContain("Example publisher");
    expect(element.textContent).toContain("1 article");
    expect(
      element.querySelector('a[href="/news?source=publisher"]'),
    ).not.toBeNull();
  });
});
