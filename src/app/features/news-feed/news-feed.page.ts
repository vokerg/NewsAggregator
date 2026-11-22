import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NewsItem } from '../../core/models/news';
import { NEWS_READ_REPOSITORY } from '../../core/data-access/news-read-repository';
import { NewsCard } from './news-card';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: readonly NewsItem[] }
  | { kind: 'error' };

@Component({
  selector: 'app-news-feed',
  imports: [NewsCard],
  templateUrl: './news-feed.page.html',
  styleUrl: './news-feed.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsFeedPage {
  private readonly repository = inject(NEWS_READ_REPOSITORY);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<FeedState>({ kind: 'loading' });
  readonly count = computed(() =>
    this.state().kind === 'ready' ? (this.state() as { kind: 'ready'; items: readonly NewsItem[] }).items.length : 0,
  );

  constructor() {
    this.reload();
  }

  reload(): void {
    this.state.set({ kind: 'loading' });
    this.repository
      .loadCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => this.state.set({ kind: 'ready', items: catalog.items }),
        error: () => this.state.set({ kind: 'error' }),
      });
  }
}
