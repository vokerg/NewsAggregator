import { DOCUMENT } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, from, map, mergeMap, Observable, of, switchMap, throwError, toArray } from "rxjs";
import { parseArticleDocument } from "../models/article-parser";
import { parseCatalog } from "../models/catalog-parser";
import {
  CatalogIndex,
  parseCatalogIndex,
  parseDiscovery,
  parseIndexedPage,
  sameDiscovery,
} from "../models/catalog-index";
import { DiscoveryItem, NewsArticle, NewsCatalog, NewsItem } from "../models/news";
import { FeedFilters, filterNews } from "../models/news-filtering";
import { NewsReadRepository } from "./news-read-repository";

@Injectable({ providedIn: "root" })
export class StaticNewsRepository implements NewsReadRepository {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  private asset(path: string): string {
    return new URL(`catalog/${path}`, this.document.baseURI).toString();
  }

  private index(): Observable<CatalogIndex | NewsCatalog> {
    // Revalidate the mutable catalog pointer on every navigation. Data pages
    // are queried by revision so a new commit cannot silently reuse a cache.
    return this.http
      .get<unknown>(this.asset("manifest.json"), {
        headers: { "Cache-Control": "no-cache" },
      })
      .pipe(map(parseCatalogIndex));
  }

  private discovery(index: CatalogIndex): Observable<readonly DiscoveryItem[]> {
    return this.http.get<unknown>(this.asset(`search.json?rev=${index.revision}`)).pipe(
      map(value => parseDiscovery(value, index)),
    );
  }

  loadDiscovery(): Observable<{ revision: string; items: readonly DiscoveryItem[] }> {
    return this.index().pipe(switchMap(index => index.schema_version === 1
      ? of({ revision: index.revision, items: index.items })
      : this.discovery(index).pipe(map(items => ({ revision: index.revision, items }))),
    ));
  }

  private query(index: CatalogIndex, page: number, filters: FeedFilters): Observable<NewsCatalog> {
    return this.discovery(index).pipe(switchMap(rows => {
      const matching = filterNews(rows, filters);
      const totalPages = Math.ceil(matching.length / 100);
      const effectivePage = Math.max(0, Math.min(page, totalPages - 1));
      const selected = matching.slice(effectivePage * 100, (effectivePage + 1) * 100);
      const wanted = new Set(selected.map(row => row.id));
      // The compact rows follow the manifest's partition order. Fetch only
      // partitions containing selected IDs; cap simultaneous HTTP requests.
      const needed: number[] = [];
      let offset = 0;
      index.pages.forEach((descriptor, i) => {
        if (rows.slice(offset, offset + descriptor.count).some(row => wanted.has(row.id))) needed.push(i);
        offset += descriptor.count;
      });
      return from(needed).pipe(
        mergeMap(i => {
          const descriptor = index.pages[i];
          const url = this.asset(`days/${descriptor.day}/${descriptor.part}.json?rev=${index.revision}`);
          return this.http.get<unknown>(url).pipe(map(value => parseIndexedPage(value, index, descriptor)));
        }, 6),
        toArray(),
        map(pages => {
          const items = new Map<string, NewsItem>();
          for (const item of pages.flatMap(part => part.items)) {
            if (!wanted.has(item.id)) continue;
            if (items.has(item.id)) throw new Error("Duplicate selected item");
            items.set(item.id, item);
          }
          const result = selected.map(row => {
            const item = items.get(row.id);
            if (!item || !sameDiscovery(row, item)) throw new Error("Discovery and page mismatch");
            return item;
          });
          return {
            schema_version: 1 as const,
            revision: index.revision,
            items: result,
            discovery: rows,
            page_info: {
              page: effectivePage,
              total_pages: totalPages,
              total_items: index.total_items,
              total_matching: matching.length,
              coverage_status: index.coverage_status ?? "unknown",
            },
          };
        }),
      );
    }));
  }

  loadCatalog(page = 0, filters?: FeedFilters): Observable<NewsCatalog> {
    return this.index().pipe(
      switchMap((index) => {
        if (index.schema_version === 1) {
          return of(index);
        }
        if (filters) return this.query(index, Number.isSafeInteger(page) ? page : 0, filters);
        if (
          !Number.isSafeInteger(page) ||
          page < 0 ||
          page >= index.pages.length
        ) {
          if (page === 0 && index.pages.length === 0) {
            return of({
              schema_version: 1 as const,
              revision: index.revision,
              items: [],
              page_info: { page: 0, total_pages: 0, total_items: 0, coverage_status: index.coverage_status ?? "unknown" },
            });
          }
          return throwError(() => new Error("Unknown catalog page"));
        }
        const descriptor = index.pages[page];
        const url = this.asset(
          `days/${descriptor.day}/${descriptor.part}.json?rev=${index.revision}`,
        );
        return this.http.get<unknown>(url).pipe(
          map((payload) => ({
            ...parseIndexedPage(payload, index, descriptor),
            page_info: {
              page,
              total_pages: index.pages.length,
              total_items: index.total_items,
              coverage_status: index.coverage_status ?? "unknown",
            },
          })),
        );
      }),
    );
  }

  private loadBody(
    item: NewsItem,
    revision: string,
    legacy = false,
  ): Observable<NewsArticle> {
    const url = this.asset(
      `items/${item.id}.json${legacy ? "" : `?rev=${revision}`}`,
    );
    return this.http.get<unknown>(url).pipe(
      map((value): NewsArticle => {
        const document = parseArticleDocument(value, item.id);
        if (
          document.body.kind === "available" &&
          item.extraction_status !== "extracted"
        ) {
          throw new Error("Public body conflicts with extraction status");
        }
        return { item, revision, body: document.body };
      }),
      catchError(() =>
        of<NewsArticle>({ item, revision, body: { kind: "load_error" } }),
      ),
    );
  }

  loadArticle(id: string): Observable<NewsArticle | null> {
    return this.index().pipe(
      switchMap((index) => {
        if (index.schema_version === 1) {
          const item = index.items.find((candidate) => candidate.id === id);
          if (!item) return of(null);
          // Legacy synthetic v1 contract: preserve its exact detail URL.
          return this.loadBody(item, index.revision, true);
        }
        // Metadata for older pages is addressable by stable ID, without
        // downloading all historical partitions into the browser.
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
          return of(null);
        }
        return this.http
          .get<unknown>(this.asset(`metadata/${id}.json?rev=${index.revision}`))
          .pipe(
            map((value) => {
              const catalog = parseCatalog(value);
              if (
                catalog.revision !== index.revision ||
                catalog.items.length !== 1 ||
                catalog.items[0].id !== id
              ) {
                throw new Error("Stale or incorrect article metadata");
              }
              return catalog.items[0];
            }),
            // Collector v2 never publishes full text. Derive body availability
            // from validated revision-bound metadata, not a mutable body file.
            map((item): NewsArticle => ({
              item,
              revision: index.revision,
              body: { kind: "unavailable", reason: item.extraction_status === "extracted" ? "rights" :
                item.extraction_status === "failed" ? "failed" :
                item.extraction_status === "not_requested" ? "not_extracted" : "unknown" },
            })),
            catchError((error: unknown) =>
              error instanceof HttpErrorResponse && error.status === 404
                ? of(null)
                : throwError(() => error),
            ),
          );
      }),
    );
  }
}
