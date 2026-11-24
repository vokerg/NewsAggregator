import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { buildFilterOptions, DEFAULT_FEED_FILTERS } from "./news-filtering";
import { NewsFiltersPanel } from "./news-filters";

describe("NewsFiltersPanel", () => {
  it("exposes labelled native controls and emits independent facet changes", () => {
    TestBed.configureTestingModule({ imports: [NewsFiltersPanel] });
    const fixture = TestBed.createComponent(NewsFiltersPanel);
    fixture.componentRef.setInput("filters", DEFAULT_FEED_FILTERS);
    fixture.componentRef.setInput(
      "options",
      buildFilterOptions(
        [
          {
            id: "example",
            title: "Example",
            source_id: "dr",
            source_name: "DR",
            original_url: "https://example.org/article",
            published_at: null,
            first_seen_at: "2026-11-18T08:00:00Z",
            perspective_ids: ["dk-media"],
            about_country_codes: ["UA"],
            extraction_status: "unavailable",
          },
        ],
        DEFAULT_FEED_FILTERS,
      ),
    );
    fixture.detectChanges();

    const emitted = vi.fn();
    const subscription =
      fixture.componentInstance.filtersChanged.subscribe(emitted);
    const element = fixture.nativeElement as HTMLElement;
    const viewLabel = element.querySelector('label[for="filter-view"]');
    const aboutLabel = element.querySelector('label[for="filter-about"]');
    expect(viewLabel?.textContent).toContain("VIEW FROM");
    expect(aboutLabel?.textContent).toContain("ABOUT");

    const select = element.querySelector("#filter-view") as HTMLSelectElement;
    select.value = "dk-media";
    select.dispatchEvent(new Event("change"));
    expect(emitted).toHaveBeenCalledWith({
      ...DEFAULT_FEED_FILTERS,
      view: "dk-media",
    });

    (element.querySelector(".clear-button") as HTMLButtonElement).click();
    expect(emitted).toHaveBeenLastCalledWith(DEFAULT_FEED_FILTERS);
    subscription.unsubscribe();
  });
});
