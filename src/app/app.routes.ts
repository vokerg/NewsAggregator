import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "news" },
  {
    path: "news",
    title: "Latest news | NewsAggregator",
    loadComponent: () =>
      import("./features/news-feed/news-feed.page").then(
        (module) => module.NewsFeedPage,
      ),
  },
  { path: "**", redirectTo: "news" },
];
