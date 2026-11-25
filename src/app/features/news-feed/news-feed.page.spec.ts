import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FEED_FILTERS } from "./news-filtering";
import { NEWS_READ_REPOSITORY } from "../../core/data-access/news-read-repository";
import { StaticNewsRepository } from "../../core/data-access/static-news-repository";
import { NewsFeedPage } from "./news-feed.page";

function setup() {
  TestBed.configureTestingModule({
    imports: [NewsFeedPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NEWS_READ_REPOSITORY, useExisting: StaticNewsRepository },
    ],
  });
  const fixture = TestBed.createComponent(NewsFeedPage);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const request = () =>
    http.expectOne((req) => req.url.endsWith("/catalog/manifest.json"));
  return { fixture, http, request };
}

describe("NewsFeedPage", () => {
  it("cancels a superseded catalog request before loading again", () => {
    const { fixture, http, request } = setup();
    const first = request();
    fixture.componentInstance.reload();
    expect(first.cancelled).toBe(true);
    request().flush({ schema_version: 1, revision: "fixture", items: [] });
    http.verify();
  });

  it("renders the genuine empty state for an empty catalog", async () => {
    const { fixture, http, request } = setup();
    expect(fixture.nativeElement.textContent).toContain("Loading news catalog");
    request().flush({ schema_version: 1, revision: "fixture", items: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("No articles yet");
    http.verify();
  });

  it("renders a conspicuous synthetic-data notice with a detail link", async () => {
    const { fixture, http, request } = setup();
    request().flush({
      schema_version: 1,
      revision: "fixture-reader-v1",
      items: [
        {
          id: "demo-one",
          title: "Invented example headline",
          source_id: "demo",
          source_name: "Example publisher",
          original_url: "https://example.org/demo",
          published_at: null,
          first_seen_at: "2026-11-18T08:00:00Z",
          perspective_ids: ["dk-media"],
          about_country_codes: ["UA"],
          tags: ["world"],
          extraction_status: "unavailable",
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      "Demonstration data only",
    );
    expect(fixture.nativeElement.textContent).toContain("1 article");
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[href="/news/demo-one"]',
      ),
    ).not.toBeNull();
    http.verify();
  });

  it("writes a shareable combined filter selection without a reload", async () => {
    const { fixture, http, request } = setup();
    request().flush({ schema_version: 1, revision: "fixture", items: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true);
    fixture.componentInstance.updateFilters({
      ...DEFAULT_FEED_FILTERS,
      view: "dk-media",
      about: "UA",
      sort: "oldest",
    });

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          view: "dk-media",
          about: "UA",
          sort: "oldest",
        }),
        queryParamsHandling: "merge",
        replaceUrl: true,
      }),
    );
    http.verify();
  });

  it("exposes an error state and retries a failed HTTP request", async () => {
    const { fixture, http, request } = setup();
    request().flush("unavailable", { status: 503, statusText: "Unavailable" });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Could not load");
    const button = fixture.nativeElement.querySelector(
      "button",
    ) as HTMLButtonElement;
    button.click();
    request().flush({ schema_version: 1, revision: "new", items: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("No articles yet");
    http.verify();
  });
});
