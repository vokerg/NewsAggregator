import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { NEWS_READ_REPOSITORY } from "../../core/data-access/news-read-repository";
import { NewsItem } from "../../core/models/news";

export interface CatalogSource {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly perspectives: readonly string[];
}

/** Only sources represented by public catalog items appear here. */
export function summarizeCatalogSources(
  items: readonly NewsItem[],
): readonly CatalogSource[] {
  const collected = new Map<
    string,
    { name: string; count: number; perspectives: Set<string> }
  >();
  for (const item of items) {
    const existing = collected.get(item.source_id);
    if (existing) {
      existing.count += 1;
      item.perspective_ids.forEach((perspective) =>
        existing.perspectives.add(perspective),
      );
    } else {
      collected.set(item.source_id, {
        name: item.source_name,
        count: 1,
        perspectives: new Set(item.perspective_ids),
      });
    }
  }
  return Array.from(collected, ([id, source]) => ({
    id,
    name: source.name,
    count: source.count,
    perspectives: Array.from(source.perspectives).sort(),
  })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

type SourceState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; revision: string; sources: readonly CatalogSource[] };

@Component({
  selector: "app-source-browser",
  imports: [RouterLink],
  templateUrl: "./source-browser.page.html",
  styleUrl: "./source-browser.page.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceBrowserPage {
  private readonly repository = inject(NEWS_READ_REPOSITORY);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<SourceState>({ kind: "loading" });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.state.set({ kind: "loading" });
    this.repository
      .loadCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) =>
          this.state.set({
            kind: "ready",
            revision: catalog.revision,
            sources: summarizeCatalogSources(catalog.items),
          }),
        error: () => this.state.set({ kind: "error" }),
      });
  }
}
