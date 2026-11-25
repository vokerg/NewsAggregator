/** Public metadata. An extracted body does not imply rights to publish it. */
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
  readonly tags?: readonly string[];
  /** Optional producer metadata; unknown must not be inferred from language or subject. */
  readonly language?: string;
  readonly publisher_country?: string;
  readonly editorial_labels?: readonly string[];
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
  /** Present for v2 day partitions; filters apply only to the loaded page. */
  readonly page_info?: {
    readonly page: number;
    readonly total_pages: number;
    readonly total_items: number;
  };
}

/**
 * Public article text requires an explicit publication basis. This marker is
 * producer-supplied and cannot itself establish ownership or a license.
 */
export type PublicArticleBody =
  | {
      readonly kind: "available";
      readonly publication_basis: "synthetic" | "licensed" | "public_domain";
      readonly paragraphs: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "rights" | "not_extracted" | "failed" | "unknown";
    };

export interface NewsArticleDocument {
  readonly schema_version: 1;
  readonly item_id: string;
  readonly body: PublicArticleBody;
}

export interface NewsArticle {
  readonly item: NewsItem;
  readonly revision: string;
  /** Local retrieval failure, never an accepted public document kind. */
  readonly body: PublicArticleBody | { readonly kind: "load_error" };
}
