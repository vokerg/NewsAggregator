import { NewsCatalog, NewsItem } from "./news";

const CATALOG_KEYS = ["schema_version", "revision", "items"];
const ITEM_KEYS = [
  "id",
  "title",
  "source_id",
  "source_name",
  "original_url",
  "published_at",
  "first_seen_at",
  "perspective_ids",
  "about_country_codes",
  "extraction_status",
];

// Catalogs are temporary bounded pages, not a substitute for the archive.
// Large, partitioned read models will get their own schema in issue #4.
const MAX_CATALOG_ITEMS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isPublicText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((part) => isPublicText(part, 128))
  );
}

function isZonedTimestamp(value: unknown): value is string {
  if (
    !isPublicText(value, 40) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return false;
  }

  const date = new Date(value);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    Number.isFinite(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === value.slice(0, 10)
  );
}

function hasSensitiveParam(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "key" ||
    normalized === "auth" ||
    /(?:token|apikey|accesskey|secret|password|session|signature|credential|authorization|cookie|jwt)$/.test(
      normalized,
    )
  );
}

function isSafePublisherUrl(value: unknown): value is string {
  if (!isPublicText(value, 2048) || /\s/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443") ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    if (Array.from(url.searchParams.keys()).some(hasSensitiveParam)) {
      return false;
    }

    const fragment = decodeURIComponent(url.hash.slice(1));
    return !fragment
      .split(/[?&#]/)
      .some(
        (part) =>
          part.includes("=") && hasSensitiveParam(part.split("=")[0] ?? ""),
      );
  } catch {
    // Includes invalid URLs and invalid percent-encoded fragments.
    return false;
  }
}

function isNewsItem(value: unknown): value is NewsItem {
  if (!isRecord(value) || !hasExactKeys(value, ITEM_KEYS)) return false;

  return (
    isPublicText(value["id"], 128) &&
    isPublicText(value["title"], 500) &&
    isPublicText(value["source_id"], 128) &&
    isPublicText(value["source_name"], 120) &&
    isSafePublisherUrl(value["original_url"]) &&
    (value["published_at"] === null ||
      isZonedTimestamp(value["published_at"])) &&
    isZonedTimestamp(value["first_seen_at"]) &&
    isStringList(value["perspective_ids"]) &&
    isStringList(value["about_country_codes"]) &&
    ["extracted", "unavailable", "failed", "not_requested"].includes(
      String(value["extraction_status"]),
    )
  );
}

/** Fail closed on unexpected keys, unbounded pages and unsafe outbound URLs. */
export function parseCatalog(value: unknown): NewsCatalog {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, CATALOG_KEYS) ||
    value["schema_version"] !== 1 ||
    !isPublicText(value["revision"], 128) ||
    !Array.isArray(value["items"]) ||
    value["items"].length > MAX_CATALOG_ITEMS ||
    !value["items"].every(isNewsItem)
  ) {
    throw new Error("Unsupported or malformed news catalog");
  }

  const items: NewsItem[] = value["items"];
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Duplicate news item ID");
  }

  return {
    schema_version: 1,
    revision: value["revision"],
    items,
  };
}
