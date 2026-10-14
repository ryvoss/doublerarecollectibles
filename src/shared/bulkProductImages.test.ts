import assert from "node:assert/strict";
import test from "node:test";
import {
  duplicateProductAssignments,
  normalizeImageMatchText,
  runIndependentImageUploads,
  suggestProductForImage,
} from "./bulkProductImages";

const products = [
  { id: 1, internalName: "Gem 3 Box", displayName: null },
  { id: 2, internalName: "Gem 4 Box", displayName: "Gem Four Booster Box" },
  { id: 3, internalName: "Crystal Box", displayName: null },
];

test("filename normalization handles extensions, punctuation, underscores, and repeated whitespace", () => {
  assert.equal(normalizeImageMatchText("Gem__3---Box.PNG"), "gem 3 box");
  assert.equal(suggestProductForImage("gem-3-box.jpg", products).status, "EXACT");
  assert.equal(suggestProductForImage("Gem 3 Box.png", products).productId, 1);
  assert.equal(suggestProductForImage("gem_3_box.webp", products).productId, 1);
});

test("ambiguous and unknown filenames remain unassigned", () => {
  const ambiguous = suggestProductForImage("gem box.png", [
    { id: 1, internalName: "Gem 3 Box", displayName: null },
    { id: 2, internalName: "Gem 4 Box", displayName: null },
  ]);
  assert.equal(ambiguous.productId, null);
  assert.equal(ambiguous.status, "NEEDS_REVIEW");
  const unmatched = suggestProductForImage("holiday-photo.png", products);
  assert.equal(unmatched.productId, null);
  assert.equal(unmatched.status, "UNMATCHED");
});

test("a unique high-confidence filename typo is suggested but remains labeled for review", () => {
  const suggestion = suggestProductForImage("Gem 3 Boox.png", products);
  assert.equal(suggestion.status, "SUGGESTED");
  assert.equal(suggestion.productId, 1);
  assert.ok(suggestion.confidence >= 0.77);
});

test("duplicate product assignments are identified before upload", () => {
  assert.deepEqual([...duplicateProductAssignments([1, 2, 1, null, 3, 3])].sort(), [1, 3]);
});

test("independent uploads retain successes and report a partial failure", async () => {
  const results = await runIndependentImageUploads(["one", "two", "three"], async (item) => {
    if (item === "two") throw new Error("Provider unavailable");
  });
  assert.deepEqual(results.map((result) => [result.item, result.ok, result.error]), [
    ["one", true, null],
    ["two", false, "Provider unavailable"],
    ["three", true, null],
  ]);
});
