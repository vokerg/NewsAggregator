/**
 * Public metadata only. The publisher's full article text is not an
 * automatically reusable public asset.
 */
export interface NewsItem {
  readonly id: string;
  readonly title: string;
  readonly source_id: string;
  readonly source_name: string;
  readonly original_url: string;
  readonly published_at: string | null;
  readonly first_seen_at: string;
  /** A publisher's perspective is not the geography of the event. */
  readonly perspective_ids: readonly string[];
  readonly about_country_codes: readonly string[];
  readonly extraction_status:
    | "extracted"
    | "unavailable"
    | "failed"
    | "not_requested";
}

export interface NewsCatalog {
  readonly schema_version: 1;
  readonly revision: string;
  readonly items: readonly NewsItem[];
}
