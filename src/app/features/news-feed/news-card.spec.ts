import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";
import { NewsItem } from "../../core/models/news";
import { NewsCard } from "./news-card";

describe("NewsCard", () => {
  it("keeps original links separate from internal navigation and labels unavailable text", () => {
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
      tags: ["politics", "world"],
      extraction_status: "unavailable",
    };

    TestBed.configureTestingModule({
      imports: [NewsCard],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(NewsCard);
    fixture.componentRef.setInput("item", item);
    fixture.detectChanges();

    const article = fixture.nativeElement as HTMLElement;
    expect(article.textContent).toContain("A headline");
    expect(article.textContent).toContain("Publication date unknown");
    expect(article.textContent).toContain("Body unavailable");
    expect(article.textContent).toContain("politics");
    expect(article.textContent).toContain("View from:");
    expect(article.textContent).toContain("About:");
    expect(article.querySelector('a[href="/news/one"]')?.textContent).toContain("A headline");
    const link = article.querySelector('a[href^="https://"]');
    expect(link?.getAttribute("href")).toBe(item.original_url);
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows publication time with explicit UTC context", () => {
    const item: NewsItem = {
      id: "two",
      title: "Publisher headline",
      source_id: "publisher",
      source_name: "Publisher",
      original_url: "https://example.org/story",
      published_at: "2026-11-18T08:30:00Z",
      first_seen_at: "2026-11-18T09:00:00Z",
      perspective_ids: ["dk-media"],
      about_country_codes: [],
      extraction_status: "extracted",
    };
    TestBed.configureTestingModule({
      imports: [NewsCard],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(NewsCard);
    fixture.componentRef.setInput("item", item);
    fixture.detectChanges();
    const time = (fixture.nativeElement as HTMLElement).querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(item.published_at);
    expect(time?.textContent).toContain("UTC");
    expect(fixture.nativeElement.textContent).toContain("Body extracted");
  });
});
