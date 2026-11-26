import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { map } from "rxjs";
import { NewsItem } from "../../core/models/news";
import { NEWS_READ_REPOSITORY } from "../../core/data-access/news-read-repository";
import {
  buildFilterOptions,
  FeedFilters,
  feedFilterQueryParams,
  filterNews,
  readFeedFilters,
} from "./news-filtering";
import { NewsFiltersPanel } from "./news-filters";
import { NewsCard } from "./news-card";

type FeedState =
  | { kind: "loading" }
  | { kind: "ready"; revision: string; items: readonly NewsItem[] }
  | { kind: "error" };

@Component({
  selector: "app-news-feed",
  imports: [NewsCard, NewsFiltersPanel],
  templateUrl: "./news-feed.page.html",
  styleUrl: "./news-feed.page.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsFeedPage {
  private readonly repository = inject(NEWS_READ_REPOSITORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state = signal<FeedState>({ kind: "loading" });
  readonly filters = toSignal(
    this.route.queryParamMap.pipe(map(readFeedFilters)),
    { initialValue: readFeedFilters(this.route.snapshot.queryParamMap) },
  );
  readonly visibleItems = computed(() => {
    const state = this.state();
    return state.kind === "ready"
      ? filterNews(state.items, this.filters())
      : [];
  });
  readonly options = computed(() => {
    const state = this.state();
    return buildFilterOptions(
      state.kind === "ready" ? state.items : [],
      this.filters(),
    );
  });
  readonly count = computed(() => this.visibleItems().length);

  constructor() {
    this.reload();
  }

  updateFilters(next: FeedFilters): void {
    // Merge keeps unrelated URL parameters; null removes a cleared facet.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: feedFilterQueryParams(next),
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  reload(): void {
    this.state.set({ kind: "loading" });
    this.repository
      .loadCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) =>
          this.state.set({
            kind: "ready",
            revision: catalog.revision,
            items: catalog.items,
          }),
        error: () => this.state.set({ kind: "error" }),
      });
  }
}
