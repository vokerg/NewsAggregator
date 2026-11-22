import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig } from "@angular/core";
import { provideRouter, withHashLocation } from "@angular/router";
import { NEWS_READ_REPOSITORY } from "./core/data-access/news-read-repository";
import { StaticNewsRepository } from "./core/data-access/static-news-repository";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    { provide: NEWS_READ_REPOSITORY, useExisting: StaticNewsRepository },
  ],
};
