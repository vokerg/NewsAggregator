import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig, isDevMode } from "@angular/core";
import { provideServiceWorker } from "@angular/service-worker";
import { provideRouter, withHashLocation } from "@angular/router";
import { NEWS_READ_REPOSITORY } from "./core/data-access/news-read-repository";
import { StaticNewsRepository } from "./core/data-access/static-news-repository";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
    { provide: NEWS_READ_REPOSITORY, useExisting: StaticNewsRepository },
  ],
};
