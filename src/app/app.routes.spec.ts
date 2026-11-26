import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { NEWS_READ_REPOSITORY } from "./core/data-access/news-read-repository";
import { NewsFeedPage } from "./features/news-feed/news-feed.page";
import { routes } from "./app.routes";

describe("App routing", () => {
  it("restores combined filters from a deep-link URL and updates on navigation", async () => {
    const common = {
      source_name: "Example publisher",
      original_url: "https://example.org/article",
      published_at: "2026-11-18T08:00:00Z",
      first_seen_at: "2026-11-18T09:00:00Z",
      extraction_status: "unavailable",
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: NEWS_READ_REPOSITORY,
          useValue: {
            loadCatalog: () =>
              of({
                schema_version: 1,
                revision: "fixture-routing",
                items: [
                  {
                    ...common,
                    id: "dk",
                    title: "Danish coverage of Ukraine",
                    source_id: "dr",
                    perspective_ids: ["dk-media"],
                    about_country_codes: ["UA"],
                  },
                  {
                    ...common,
                    id: "ru",
                    title: "Russian state coverage",
                    source_id: "state",
                    perspective_ids: ["ru-state-media"],
                    about_country_codes: ["UA"],
                  },
                ],
              }),
          },
        },
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/news?view=dk-media&about=UA", NewsFeedPage);
    expect(harness.routeNativeElement?.textContent).toContain(
      "Danish coverage of Ukraine",
    );
    expect(harness.routeNativeElement?.textContent).not.toContain(
      "Russian state coverage",
    );
    expect(
      harness.routeNativeElement?.querySelectorAll("app-news-card").length,
    ).toBe(1);

    await harness.navigateByUrl("/news?view=dk-media&about=DK", NewsFeedPage);
    expect(harness.routeNativeElement?.textContent).toContain(
      "No matching articles",
    );
    expect(TestBed.inject(Router).url).toContain("about=DK");
  });

  it("lazy-loads the news feed and redirects unknown paths", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: NEWS_READ_REPOSITORY,
          useValue: {
            loadCatalog: () =>
              of({ schema_version: 1, revision: "test", items: [] }),
          },
        },
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl("/news", NewsFeedPage);
    expect(harness.routeNativeElement?.textContent).toContain(
      "No articles yet",
    );

    await harness.navigateByUrl("/a-missing-page", NewsFeedPage);
    expect(TestBed.inject(Router).url).toBe("/news");
  });
});
