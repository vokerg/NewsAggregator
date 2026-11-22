import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { NEWS_READ_REPOSITORY } from "../../core/data-access/news-read-repository";
import { NewsArticle } from "../../core/models/news";
import { routes } from "../../app.routes";
import { NewsDetailPage } from "./news-detail.page";

const article: NewsArticle = {
  revision: "fixture-reader-v1",
  item: {
    id: "demo-one",
    title: "Invented example",
    source_id: "demo",
    source_name: "Synthetic publisher",
    original_url: "https://example.org/original",
    published_at: "2026-11-18T08:30:00Z",
    first_seen_at: "2026-11-18T09:00:00Z",
    perspective_ids: ["dk-media"],
    about_country_codes: ["UA"],
    tags: ["world"],
    extraction_status: "extracted",
  },
  body: {
    kind: "available",
    publication_basis: "synthetic",
    paragraphs: ["<script>alert('not executed')</script>", "Invented content only."],
  },
};

async function setup(loadArticle: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      {
        provide: NEWS_READ_REPOSITORY,
        useValue: { loadCatalog: () => of({ schema_version: 1, revision: "fixture", items: [] }), loadArticle },
      },
    ],
  });
  return RouterTestingHarness.create();
}

describe("NewsDetailPage", () => {
  it("renders escaped original plain text, attribution and direct original URL", async () => {
    const harness = await setup(vi.fn(() => of(article)));
    await harness.navigateByUrl("/news/demo-one", NewsDetailPage);
    const page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain("Demonstration data only");
    expect(page.textContent).toContain("Invented example");
    expect(page.textContent).toContain("dk-media");
    expect(page.textContent).toContain("UA");
    expect(page.textContent).toContain("Original synthetic");
    expect(page.querySelector(".body-text script")).toBeNull();
    expect(page.querySelector(".body-text")?.textContent).toContain("<script>");
    const original = page.querySelector('a[href^="https://"]');
    expect(original?.getAttribute("href")).toBe("https://example.org/original");
    expect(original?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders unavailable text without fabricating a summary", async () => {
    const unavailable: NewsArticle = {
      ...article,
      item: { ...article.item, extraction_status: "unavailable" },
      body: { kind: "unavailable", reason: "rights" },
    };
    const harness = await setup(vi.fn(() => of(unavailable)));
    await harness.navigateByUrl("/news/demo-one", NewsDetailPage);
    expect(harness.routeNativeElement?.textContent).toContain("not publicly available");
    expect(harness.routeNativeElement?.textContent).toContain("rights");
    expect((harness.routeNativeElement as HTMLElement).querySelector(".body-text")).toBeNull();
  });

  it("distinguishes missing items from network errors and retries failures", async () => {
    const loadArticle = vi
      .fn()
      .mockReturnValueOnce(of(null))
      .mockReturnValueOnce(throwError(() => new Error("offline")))
      .mockReturnValueOnce(of(article));
    const harness = await setup(loadArticle);
    await harness.navigateByUrl("/news/missing", NewsDetailPage);
    expect(harness.routeNativeElement?.textContent).toContain("Article not found");

    await harness.navigateByUrl("/news/demo-one", NewsDetailPage);
    expect(harness.routeNativeElement?.textContent).toContain("Could not load");
    const retryButton = (harness.routeNativeElement as HTMLElement).querySelector(
      "button",
    ) as HTMLButtonElement;
    retryButton.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain("Invented content only");
    expect(loadArticle).toHaveBeenCalledTimes(3);
  });
});
