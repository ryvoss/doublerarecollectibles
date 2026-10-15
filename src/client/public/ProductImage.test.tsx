import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductImage } from "../components/ProductImage";

Object.assign(globalThis, { React });

test("shared product image renders contained image variants with meaningful alt text", () => {
  const markup = renderToStaticMarkup(React.createElement(ProductImage, {
    alt: "Gem 6 Booster Box",
    loading: "lazy",
    src: "/api/public/images/products/6/example.png",
    variant: "card",
  }));

  assert.match(markup, /product-image-frame product-image-frame--card/);
  assert.match(markup, /product-image-frame__image/);
  assert.match(markup, /alt="Gem 6 Booster Box"/);
  assert.match(markup, /loading="lazy"/);
});

test("shared product image fallback retains frame dimensions and accessible behavior", () => {
  const accessible = renderToStaticMarkup(React.createElement(ProductImage, {
    alt: "Gem 6 Booster Box",
    fallbackAriaLabel: "Gem 6 Booster Box image not available",
    fallbackDescription: "Image coming soon",
    src: null,
    variant: "modal",
  }));
  const decorative = renderToStaticMarkup(React.createElement(ProductImage, {
    alt: "",
    src: null,
    variant: "thumbnail",
  }));

  assert.match(accessible, /product-image-frame--modal/);
  assert.match(accessible, /role="img"/);
  assert.match(accessible, /Gem 6 Booster Box image not available/);
  assert.match(accessible, /Image coming soon/);
  assert.match(decorative, /product-image-frame--thumbnail/);
  assert.match(decorative, /aria-hidden="true"/);
});

test("shared image CSS contains product assets and gives frames stable ratios", () => {
  const css = readFileSync(new URL("../components/ProductImage.css", import.meta.url), "utf8");

  assert.match(css, /\.product-image-frame__image[\s\S]*width: 100%/);
  assert.match(css, /\.product-image-frame__image[\s\S]*height: 100%/);
  assert.match(css, /\.product-image-frame__image[\s\S]*object-fit: contain/);
  assert.match(css, /\.product-image-frame__image[\s\S]*object-position: center/);
  assert.match(css, /\.product-image-frame--card[\s\S]*aspect-ratio: 4 \/ 3/);
  assert.match(css, /\.product-image-frame--thumbnail[\s\S]*aspect-ratio: 1/);
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});

test("major public and admin product-image surfaces use the shared component", () => {
  const surfaces = [
    "./PublicInventoryCard.tsx",
    "./ProductDetailModal.tsx",
    "../components/ProductImageManager.tsx",
    "../components/PublicListingManager.tsx",
    "../components/BulkProductImageUpload.tsx",
  ];

  for (const surface of surfaces) {
    const source = readFileSync(new URL(surface, import.meta.url), "utf8");
    assert.match(source, /ProductImage/);
  }
});
