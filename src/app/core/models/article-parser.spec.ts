import { describe, expect, it } from "vitest";
import { parseArticleDocument } from "./article-parser";

const available = {
  schema_version: 1,
  item_id: "demo-one",
  body: {
    kind: "available",
    publication_basis: "synthetic",
    paragraphs: ["Created by the project, not a publisher."],
  },
};

describe("parseArticleDocument", () => {
  it("accepts bounded plain-text synthetic or licensed content", () => {
    expect(parseArticleDocument(available, "demo-one").body).toEqual(
      available.body,
    );
    expect(
      parseArticleDocument(
        {
          ...available,
          body: { ...available.body, publication_basis: "licensed" },
        },
        "demo-one",
      ).body.kind,
    ).toBe("available");
  });

  it("preserves explicit unavailable reasons, including rights restrictions", () => {
    const restricted = {
      schema_version: 1,
      item_id: "demo-one",
      body: { kind: "unavailable", reason: "rights" },
    };
    expect(parseArticleDocument(restricted, "demo-one").body).toEqual(
      restricted.body,
    );
  });

  it("rejects wrong IDs, unexpected fields and unsupported versions", () => {
    expect(() => parseArticleDocument(available, "other-id")).toThrow();
    expect(() =>
      parseArticleDocument({ ...available, api_key: "secret" }, "demo-one"),
    ).toThrow();
    expect(() =>
      parseArticleDocument({ ...available, schema_version: 2 }, "demo-one"),
    ).toThrow();
    expect(() =>
      parseArticleDocument(
        {
          ...available,
          body: { kind: "unavailable", reason: "rights", text: "oops" },
        },
        "demo-one",
      ),
    ).toThrow();
  });

  it("rejects unlicensed, unbounded and invalid body payloads", () => {
    for (const body of [
      { kind: "available", paragraphs: ["Missing publication basis"] },
      {
        kind: "available",
        publication_basis: "unknown",
        paragraphs: ["No rights"],
      },
      { kind: "available", publication_basis: "synthetic", paragraphs: [] },
      {
        kind: "available",
        publication_basis: "synthetic",
        paragraphs: ["x".repeat(4001)],
      },
      {
        kind: "available",
        publication_basis: "synthetic",
        paragraphs: ["bad\u0000value"],
      },
      {
        kind: "available",
        publication_basis: "synthetic",
        paragraphs: Array(61).fill("text"),
      },
      {
        kind: "available",
        publication_basis: ["synthetic"],
        paragraphs: ["Invalid enum"],
      },
      {
        kind: "available",
        publication_basis: "synthetic",
        paragraphs: Array(16).fill("x".repeat(4000)),
      },
      { kind: "unavailable", reason: ["rights"] },
      { kind: "load_error" },
      { kind: "unavailable", reason: "unreviewed" },
      {
        kind: "unavailable",
        reason: "rights",
        paragraphs: ["must be omitted"],
      },
    ]) {
      expect(() =>
        parseArticleDocument({ ...available, body }, "demo-one"),
      ).toThrow();
    }
  });
});
