import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { NewsCatalog } from '../models/news';

/** Read-only port; neither UI components nor browser data-access can commit to GitHub. */
export interface NewsReadRepository {
  loadCatalog(): Observable<NewsCatalog>;
}

export const NEWS_READ_REPOSITORY = new InjectionToken<NewsReadRepository>(
  'NewsReadRepository',
);
