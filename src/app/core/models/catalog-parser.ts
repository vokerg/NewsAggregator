import { NewsCatalog, NewsItem } from './news';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isSafePublisherUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isNewsItem(value: unknown): value is NewsItem {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['title']) &&
    isNonEmptyString(value['source_id']) &&
    isNonEmptyString(value['source_name']) &&
    isSafePublisherUrl(value['original_url']) &&
    (value['published_at'] === null || isNonEmptyString(value['published_at'])) &&
    isNonEmptyString(value['first_seen_at']) &&
    isStringList(value['perspective_ids']) &&
    isStringList(value['about_country_codes']) &&
    ['extracted', 'unavailable', 'failed', 'not_requested'].includes(
      String(value['extraction_status']),
    )
  );
}

/** Treat committed static JSON as untrusted input until its shape is validated. */
export function parseCatalog(value: unknown): NewsCatalog {
  if (
    !isRecord(value) ||
    value['schema_version'] !== 1 ||
    !isNonEmptyString(value['revision']) ||
    !Array.isArray(value['items']) ||
    !value['items'].every(isNewsItem)
  ) {
    throw new Error('Unsupported or malformed news catalog');
  }

  return {
    schema_version: 1,
    revision: value['revision'],
    items: value['items'],
  };
}
