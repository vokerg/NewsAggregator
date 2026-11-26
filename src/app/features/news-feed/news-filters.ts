import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import {
  DEFAULT_FEED_FILTERS,
  FacetKey,
  FeedFilters,
  FilterOptions,
} from "./news-filtering";

@Component({
  selector: "app-news-filters",
  templateUrl: "./news-filters.html",
  styleUrl: "./news-filters.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsFiltersPanel {
  readonly filters = input.required<FeedFilters>();
  readonly options = input.required<FilterOptions>();
  readonly filtersChanged = output<FeedFilters>();

  readonly facets: readonly {
    readonly key: FacetKey;
    readonly title: string;
  }[] = [
    { key: "view", title: "VIEW FROM (media perspective)" },
    { key: "about", title: "ABOUT (event country)" },
    { key: "source", title: "Source" },
    { key: "language", title: "Article language" },
    { key: "publisher", title: "Publisher country" },
    { key: "tag", title: "Topic tag" },
    { key: "editorial", title: "Editorial label" },
  ];

  changeFacet(key: FacetKey, value: string): void {
    this.filtersChanged.emit({ ...this.filters(), [key]: value });
  }

  changeDate(key: "from" | "to", value: string): void {
    this.filtersChanged.emit({ ...this.filters(), [key]: value });
  }

  changeSort(value: FeedFilters["sort"]): void {
    this.filtersChanged.emit({ ...this.filters(), sort: value });
  }

  clear(): void {
    this.filtersChanged.emit({ ...DEFAULT_FEED_FILTERS });
  }
}
