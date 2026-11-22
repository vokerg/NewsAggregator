import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { catchError, combineLatest, map, of, startWith, Subject, switchMap } from "rxjs";
import { NEWS_READ_REPOSITORY } from "../../core/data-access/news-read-repository";
import { NewsArticle } from "../../core/models/news";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; article: NewsArticle }
  | { kind: "missing" }
  | { kind: "error" };

@Component({
  selector: "app-news-detail",
  imports: [DatePipe, RouterLink],
  templateUrl: "./news-detail.page.html",
  styleUrl: "./news-detail.page.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(NEWS_READ_REPOSITORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retries = new Subject<void>();

  readonly state = signal<DetailState>({ kind: "loading" });

  constructor() {
    combineLatest([this.route.paramMap, this.retries.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) => {
          this.state.set({ kind: "loading" });
          const id = params.get("id");
          if (!id) return of<DetailState>({ kind: "missing" });

          return this.repository.loadArticle(id).pipe(
            map((article): DetailState =>
              article ? { kind: "ready", article } : { kind: "missing" },
            ),
            catchError(() => of<DetailState>({ kind: "error" })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.state.set(state));
  }

  reload(): void {
    this.retries.next();
  }
}
