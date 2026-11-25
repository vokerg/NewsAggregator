import { NewsCatalog } from "./news";
import { parseCatalog } from "./catalog-parser";

export interface CatalogPageDescriptor {
  readonly day: string;
  readonly part: number;
  readonly count: number;
}

export interface CatalogIndex {
  readonly schema_version: 2;
  readonly revision: string;
  readonly total_items: number;
  readonly pages: readonly CatalogPageDescriptor[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseCatalogIndex(value: unknown): CatalogIndex | NewsCatalog {
  if (isRecord(value) && value["schema_version"] === 1) {
    return parseCatalog(value);
  }
  if (
    !isRecord(value) ||
    value["schema_version"] !== 2 ||
    Object.keys(value).sort().join(",") !== "pages,revision,schema_version,total_items" ||
    typeof value["revision"] !== "string" ||
    !/^data-[a-f0-9]{24}$/.test(value["revision"]) ||
    !Number.isSafeInteger(value["total_items"]) ||
    (value["total_items"] as number) < 0 ||
    (value["total_items"] as number) > 100_000 ||
    !Array.isArray(value["pages"]) ||
    value["pages"].length > 2_000
  ) {
    throw new Error("Unsupported public catalog index");
  }
  const pages: CatalogPageDescriptor[] = value["pages"];
  let previousDay = "";
  let previousPart = 0;
  let total = 0;
  for (const page of pages) {
    if (
      !isRecord(page) ||
      Object.keys(page).sort().join(",") !== "count,day,part" ||
      !isDay(page["day"]) ||
      !Number.isSafeInteger(page["part"]) ||
      (page["part"] as number) < 1 ||
      !Number.isSafeInteger(page["count"]) ||
      (page["count"] as number) < 1 ||
      (page["count"] as number) > 100
    ) {
      throw new Error("Invalid catalog page");
    }
    if (
      (previousDay !== "" && page["day"] > previousDay) ||
      (page["day"] === previousDay && page["part"] !== previousPart + 1) ||
      (page["day"] !== previousDay && page["part"] !== 1)
    ) {
      throw new Error("Unsorted or discontinuous catalog pages");
    }
    previousDay = page["day"];
    previousPart = page["part"];
    total += page["count"] as number;
  }
  if (total !== value["total_items"]) {
    throw new Error("Catalog item total mismatch");
  }
  return value as unknown as CatalogIndex;
}

/** A page's revision and record count must match the manifest. */
export function parseIndexedPage(
  payload: unknown,
  index: CatalogIndex,
  page: CatalogPageDescriptor,
): NewsCatalog {
  const catalog = parseCatalog(payload);
  if (catalog.revision !== index.revision || catalog.items.length !== page.count) {
    throw new Error("Stale or inconsistent catalog page");
  }
  const ids = catalog.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate catalog IDs");
  }
  if (catalog.items.some((item) =>
    (item.published_at ?? item.first_seen_at).slice(0, 10) !== page.day
  )) {
    throw new Error("Page contains the wrong calendar day");
  }
  return catalog;
}
