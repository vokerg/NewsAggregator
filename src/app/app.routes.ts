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
  {
    path: "news/:id",
    title: "Article | NewsAggregator",
    loadComponent: () =>
      import("./features/news-detail/news-detail.page").then(
        (module) => module.NewsDetailPage,
      ),
  },
  { path: "**", redirectTo: "news" },
];
