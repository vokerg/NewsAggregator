import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { NewsItem } from "../../core/models/news";
import { NewsCard } from "./news-card";

describe("NewsCard", () => {
  it("links to the exact original URL and labels undated/unavailable body", () => {
    const item: NewsItem = {
      id: "one",
      title: "A headline",
      source_id: "publisher",
      source_name: "Publisher",
      original_url: "https://example.org/story?edition=one",
      published_at: null,
      first_seen_at: "2026-11-18T00:00:00Z",
      perspective_ids: ["dk-media"],
      about_country_codes: ["UA"],
      extraction_status: "unavailable",
    };

    TestBed.configureTestingModule({ imports: [NewsCard] });
    const fixture = TestBed.createComponent(NewsCard);
    fixture.componentRef.setInput("item", item);
    fixture.detectChanges();

    const article = fixture.nativeElement as HTMLElement;
    expect(article.textContent).toContain("A headline");
    expect(article.textContent).toContain("Publication date unknown");
    expect(article.textContent).toContain("Body unavailable");
    const link = article.querySelector("a");
    expect(link?.getAttribute("href")).toBe(item.original_url);
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
