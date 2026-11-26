// Validate the actual release files with the browser's own parsers.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const ts = require("typescript");

const root = path.resolve(process.argv[2] || "public/catalog");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-validator-"));
try {
  const models = path.resolve(__dirname, "../src/app/core/models");
  for (const name of ["news", "catalog-parser", "catalog-index", "article-parser"]) {
    const source = fs.readFileSync(path.join(models, name + ".ts"), "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    fs.writeFileSync(path.join(tmp, name + ".js"), result.outputText);
  }
  const { parseCatalog } = require(path.join(tmp, "catalog-parser.js"));
  const { parseCatalogIndex, parseIndexedPage, parseDiscovery, sameDiscovery } = require(path.join(tmp, "catalog-index.js"));
  const { parseArticleDocument } = require(path.join(tmp, "article-parser.js"));
  const expected = new Set();
  function read(relative) {
    const full = path.join(root, relative);
    assert(fs.lstatSync(full).isFile(), "Expected regular catalog file");
    expected.add(relative);
    return JSON.parse(fs.readFileSync(full, "utf8"));
  }
  const index = parseCatalogIndex(read("manifest.json"));
  let items;
  if (index.schema_version === 1) {
    assert(index.revision.startsWith("fixture-"), "Only the labeled demo may use v1");
    items = index.items;
  } else {
    const rows = parseDiscovery(read("search.json"), index);
    items = index.pages.flatMap(page => parseIndexedPage(
      read(`days/${page.day}/${page.part}.json`), index, page
    ).items);
    assert.equal(items.length, rows.length);
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
    for (let i = 0; i < rows.length; i++) {
      assert(sameDiscovery(rows[i], items[i]), "Discovery order or metadata mismatch");
    }
  }
  for (const item of items) {
    if (index.schema_version === 2) {
      const meta = parseCatalog(read(`metadata/${item.id}.json`));
      assert.equal(meta.revision, index.revision);
      assert.deepEqual(meta.items, [item]);
    }
    const doc = parseArticleDocument(read(`items/${item.id}.json`), item.id);
    if (index.schema_version === 2) {
      assert.equal(doc.body.kind, "unavailable");
      assert.equal(doc.body.reason, {
        extracted: "rights", failed: "failed", not_requested: "not_extracted", unavailable: "unknown",
      }[item.extraction_status]);
    } else if (doc.body.kind === "available") {
      assert.equal(doc.body.publication_basis, "synthetic");
      assert.equal(item.extraction_status, "extracted");
    }
  }
  function walk(dir, prefix = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel + "/");
      else assert(entry.isFile() && expected.delete(rel), "Unexpected catalog file");
    }
  }
  walk(root);
  assert.equal(expected.size, 0, "Missing catalog file");
  console.log(`Validated catalog v${index.schema_version}: ${items.length} items, ${index.revision}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
