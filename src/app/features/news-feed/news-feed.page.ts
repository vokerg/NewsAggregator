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
import { distinctUntilChanged, map, Subscription } from "rxjs";
import { DiscoveryItem, NewsItem } from "../../core/models/news";
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
  | {
      kind: "ready";
      revision: string;
      items: readonly NewsItem[];
      discovery?: readonly DiscoveryItem[];
      pageInfo?: {
        page: number;
        total_pages: number;
        total_items: number;
        total_matching?: number;
        coverage_status?: "unknown" | "idle" | "ok" | "partial" | "failed";
      };
    }
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
  private catalogRequest?: Subscription;

  readonly state = signal<FeedState>({ kind: "loading" });
  readonly page = signal(0);
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
      state.kind === "ready" ? (state.discovery ?? state.items) : [],
      this.filters(),
    );
  });
  readonly count = computed(() => this.visibleItems().length);

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((params) => {
          const raw = params.get("catalogPage") ?? "1";
          const page = /^[1-9][0-9]{0,3}$/.test(raw)
            ? Math.min(Number(raw), 2000) - 1
            : 0;
          return { page, filters: readFeedFilters(params) };
        }),
        distinctUntilChanged(
          (a, b) =>
            a.page === b.page &&
            JSON.stringify(a.filters) === JSON.stringify(b.filters),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ page }) => {
        this.page.set(page);
        this.reload();
      });
  }

  changePage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { catalogPage: page === 0 ? null : String(page + 1) },
      queryParamsHandling: "merge",
    });
  }

  updateFilters(next: FeedFilters): void {
    // Merge keeps unrelated URL parameters; null removes a cleared facet.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...feedFilterQueryParams(next), catalogPage: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  reload(): void {
    // A slower old page must never replace the latest navigation result.
    this.catalogRequest?.unsubscribe();
    this.state.set({ kind: "loading" });
    this.catalogRequest = this.repository
      .loadCatalog(this.page(), this.filters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) =>
          this.state.set({
            kind: "ready",
            revision: catalog.revision,
            items: catalog.items,
            discovery: catalog.discovery,
            pageInfo: catalog.page_info,
          }),
        error: () => this.state.set({ kind: "error" }),
      });
  }
}
