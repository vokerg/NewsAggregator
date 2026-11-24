import { DOCUMENT } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { catchError, map, Observable, of, switchMap } from "rxjs";
import { parseArticleDocument } from "../models/article-parser";
import { parseCatalog } from "../models/catalog-parser";
import { NewsArticle, NewsCatalog } from "../models/news";
import { NewsReadRepository } from "./news-read-repository";

@Injectable({ providedIn: "root" })
export class StaticNewsRepository implements NewsReadRepository {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  loadCatalog(): Observable<NewsCatalog> {
    // document.baseURI respects the Pages /NewsAggregator/ project subpath.
    const url = new URL(
      "catalog/manifest.json",
      this.document.baseURI,
    ).toString();
    return this.http.get<unknown>(url).pipe(map(parseCatalog));
  }

  loadArticle(id: string): Observable<NewsArticle | null> {
    return this.loadCatalog().pipe(
      switchMap((catalog) => {
        const item = catalog.items.find((candidate) => candidate.id === id);
        if (!item) return of(null);

        // Catalog IDs have a strict path-safe format (verified by parseCatalog).
        const url = new URL(
          `catalog/items/${item.id}.json`,
          this.document.baseURI,
        ).toString();
        return this.http.get<unknown>(url).pipe(
          map((value): NewsArticle => {
            const document = parseArticleDocument(value, item.id);
            if (
              document.body.kind === "available" &&
              item.extraction_status !== "extracted"
            ) {
              throw new Error("Public body conflicts with extraction status");
            }
            return { item, revision: catalog.revision, body: document.body };
          }),
          catchError(() =>
            of<NewsArticle>({
              item,
              revision: catalog.revision,
              body: { kind: "load_error" },
            }),
          ),
        );
      }),
    );
  }
}
