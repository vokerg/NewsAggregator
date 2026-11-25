import { DOCUMENT } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, map, Observable, of, switchMap, throwError } from "rxjs";
import { parseArticleDocument } from "../models/article-parser";
import { parseCatalog } from "../models/catalog-parser";
import {
  CatalogIndex,
  parseCatalogIndex,
  parseIndexedPage,
} from "../models/catalog-index";
import { NewsArticle, NewsCatalog, NewsItem } from "../models/news";
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

  loadCatalog(page = 0): Observable<NewsCatalog> {
    return this.index().pipe(
      switchMap((index) => {
        if (index.schema_version === 1) {
          return of(index);
        }
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
              page_info: { page: 0, total_pages: 0, total_items: 0 },
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
            switchMap((item) => this.loadBody(item, index.revision)),
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
