// Guard against accidentally turning the entire news archive into a
// prefetched asset, or switching catalog reads to cache-first.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const config = JSON.parse(fs.readFileSync("ngsw-config.json", "utf8"));
const manifest = JSON.parse(
  fs.readFileSync("public/manifest.webmanifest", "utf8"),
);
const pkg = require("../package.json");
const angular = require("../angular.json");
const groups = config.dataGroups;
const shell = config.assetGroups.flatMap((group) => group.resources.files);
assert.equal(pkg.dependencies["@angular/service-worker"], pkg.dependencies["@angular/core"]);
assert.equal(angular.projects["news-aggregator"].architect.build.configurations.production.serviceWorker, "ngsw-config.json");
assert(!shell.some((pattern) => pattern.includes("catalog")), "Catalog must not be a shell asset");
assert.equal(groups.length, 2);
for (const group of groups) {
  assert.equal(group.cacheConfig.strategy, "freshness");
  assert(group.cacheConfig.maxSize > 0 && group.cacheConfig.maxSize <= 120);
  assert(group.cacheConfig.timeout, "Offline fallback must be bounded");
  assert(group.cacheConfig.maxAge, "Cached news needs an expiry");
}
assert(groups[0].urls.includes("/catalog/manifest.json"));
for (const required of [
  "/catalog/search.json",
  "/catalog/days/**",
  "/catalog/metadata/**",
  "/catalog/items/**",
]) assert(groups[1].urls.includes(required));
assert.equal(manifest.start_url, "/NewsAggregator/#/news");
assert.equal(manifest.scope, "/NewsAggregator/");
assert.equal(manifest.display, "standalone");
for (const size of [192, 512]) {
  const icon = manifest.icons.find((entry) => entry.sizes === size + "x" + size);
  assert(icon && icon.purpose.includes("maskable"));
  const file = path.join("public", icon.src);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", "PNG signature");
  assert.equal(bytes.readUInt32BE(16), size, "PNG width");
  assert.equal(bytes.readUInt32BE(20), size, "PNG height");
}
const dist = process.argv[2];
if (dist) {
  const prefix = path.resolve(dist);
  for (const required of [
    "ngsw-worker.js",
    "ngsw.json",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
  ]) assert(fs.statSync(path.join(prefix, required)).isFile(), "Missing " + required);
  const generated = JSON.parse(fs.readFileSync(path.join(prefix, "ngsw.json"), "utf8"));
  assert.equal(generated.dataGroups.length, 2);
  assert(generated.dataGroups.every((group) => group.strategy === "freshness"));
  const matches = (group, url) =>
    group.patterns.some((pattern) => new RegExp(pattern).test(url));
  assert(
    matches(generated.dataGroups[0], "/NewsAggregator/catalog/manifest.json"),
    "Manifest must match the generated Pages URL pattern",
  );
  for (const url of [
    "/NewsAggregator/catalog/search.json",
    "/NewsAggregator/catalog/days/2026-11-18/0.json",
    "/NewsAggregator/catalog/metadata/example-1.json",
    "/NewsAggregator/catalog/items/example-1.json",
  ]) {
    assert(
      matches(generated.dataGroups[1], url),
      "News URL must match the network-first Pages cache group: " + url,
    );
  }
}
console.log("PWA manifest, bounded cache policy and production artifacts validated");
