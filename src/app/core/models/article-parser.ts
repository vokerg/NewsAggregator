import { NewsArticleDocument } from "./news";

const MAX_PARAGRAPHS = 60;
const MAX_BODY_LENGTH = 60_000;

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

function isPlainText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4000 &&
    value.trim() === value &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}

/**
 * Only narrowly bounded, explicitly publishable plain text is accepted.
 * The upstream producer must independently verify the claimed rights.
 */
export function parseArticleDocument(
  value: unknown,
  expectedId: string,
): NewsArticleDocument {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema_version", "item_id", "body"]) ||
    value["schema_version"] !== 1 ||
    value["item_id"] !== expectedId ||
    !isRecord(value["body"])
  ) {
    throw new Error("Unsupported or malformed public article");
  }

  const body = value["body"];
  if (body["kind"] === "available") {
    const paragraphs = body["paragraphs"];
    if (
      !hasExactKeys(body, ["kind", "publication_basis", "paragraphs"]) ||
      !["synthetic", "licensed", "public_domain"].includes(
        String(body["publication_basis"]),
      ) ||
      !Array.isArray(paragraphs) ||
      paragraphs.length === 0 ||
      paragraphs.length > MAX_PARAGRAPHS ||
      !paragraphs.every(isPlainText) ||
      paragraphs.reduce(
        (total: number, paragraph: string) => total + paragraph.length,
        0,
      ) > MAX_BODY_LENGTH
    ) {
      throw new Error("Unsafe or unlicensed public article text");
    }
  } else if (
    body["kind"] !== "unavailable" ||
    !hasExactKeys(body, ["kind", "reason"]) ||
    !["rights", "not_extracted", "failed", "unknown"].includes(
      String(body["reason"]),
    )
  ) {
    throw new Error("Invalid public article availability");
  }

  return value as unknown as NewsArticleDocument;
}
