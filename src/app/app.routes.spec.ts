import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { NEWS_READ_REPOSITORY } from "./core/data-access/news-read-repository";
import { NewsFeedPage } from "./features/news-feed/news-feed.page";
import { routes } from "./app.routes";

describe("App routing", () => {
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
