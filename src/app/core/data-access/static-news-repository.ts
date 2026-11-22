import { DOCUMENT } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { parseCatalog } from "../models/catalog-parser";
import { NewsCatalog } from "../models/news";
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
}
