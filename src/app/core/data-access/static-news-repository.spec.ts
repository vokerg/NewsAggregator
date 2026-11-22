import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { StaticNewsRepository } from "./static-news-repository";

describe("StaticNewsRepository", () => {
  it("requests the catalog relative to the document base URL", () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const repository = TestBed.inject(StaticNewsRepository);
    const http = TestBed.inject(HttpTestingController);
    let revision: string | undefined;

    repository
      .loadCatalog()
      .subscribe((catalog) => (revision = catalog.revision));

    const request = http.expectOne((req) =>
      req.url.endsWith("/catalog/manifest.json"),
    );
    expect(request.request.method).toBe("GET");
    request.flush({ schema_version: 1, revision: "fixture", items: [] });
    http.verify();
    expect(revision).toBe("fixture");
  });
});
