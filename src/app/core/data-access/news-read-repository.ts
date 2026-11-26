import { InjectionToken } from "@angular/core";
import { Observable } from "rxjs";
import { FeedFilters } from "../models/news-filtering";
import { DiscoveryItem, NewsArticle, NewsCatalog } from "../models/news";

/** Read-only port; neither UI components nor browser data-access can commit to GitHub. */
export interface NewsReadRepository {
  loadCatalog(page?: number, filters?: FeedFilters): Observable<NewsCatalog>;
  loadDiscovery(): Observable<{ revision: string; items: readonly DiscoveryItem[] }>;
  /** null means unknown ID; catalog errors fail, body errors retain metadata. */
  loadArticle(id: string): Observable<NewsArticle | null>;
}

export const NEWS_READ_REPOSITORY = new InjectionToken<NewsReadRepository>(
  "NewsReadRepository",
);
