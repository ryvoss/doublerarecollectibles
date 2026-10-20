import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicLink } from "./PublicLink";
import { InventoryEmptyState } from "./InventoryEmptyState";
import { PublicProductStatus } from "./PublicProductStatus";
import { PublicInventoryCard } from "./PublicInventoryCard";
import { ProductDetailContent } from "./ProductDetailModal";
import type { PublicInventoryItem } from "../../shared/publicInventory";

Object.assign(globalThis, { React });

const product: PublicInventoryItem = {
  id: 1, name: "Collector box", shortDescription: null, imageUrl: null,
  displayPrice: null, compareAtPrice: null, recentPriceDrop: true,
  featured: true, availability: "SOLD_OUT", moreArrivingSoon: false,
};

for (const [availability, label] of [
  ["IN_STOCK", "In Stock"], ["LOW_STOCK", "Low Stock"],
  ["SOLD_OUT", "Sold Out"], ["COMING_SOON", "Coming Soon"],
] as const) {
  test(`card and dialog preserve ${availability} with promotional badges`, () => {
    const item = { ...product, availability };
    const status = renderToStaticMarkup(<PublicProductStatus product={item} className="status" />);
    assert.match(status, new RegExp(label));
    for (const markup of [
      renderToStaticMarkup(<PublicInventoryCard product={item} onOpen={() => undefined} onInterested={() => undefined} />),
      renderToStaticMarkup(<ProductDetailContent product={item} onInterested={() => undefined} />),
    ]) {
      assert.ok(markup.includes(status.replace('class="status"', markup.includes('public-catalog-card') ? 'class="public-catalog-card__status"' : 'class="public-product-detail__status"')));
      assert.match(markup, /Contact for price/);
      assert.doesNotMatch(markup, /Add to cart|Buy now|Reserve now|unitsAvailable|cogs/i);
    }
  });
}

test("empty public inventory makes no unverified inbound promise", () => {
  const markup = renderToStaticMarkup(<InventoryEmptyState />);
  assert.match(markup, /No products are listed right now/);
  assert.doesNotMatch(markup, /on the way|arriving|update in progress/i);
});

test("navigation announces only the current page", () => {
  assert.match(renderToStaticMarkup(<PublicLink href="/shows" current onNavigate={() => undefined}>Shows</PublicLink>), /aria-current="page"/);
  assert.doesNotMatch(renderToStaticMarkup(<PublicLink href="/shows" onNavigate={() => undefined}>Shows</PublicLink>), /aria-current/);
});

test("public links preserve modified clicks and native new-tab behavior", () => {
  let navigations = 0;
  let prevented = 0;
  const link = PublicLink({ href: "/inventory", children: "Inventory", onNavigate: (path) => {
    assert.equal(path, "/inventory"); navigations += 1;
  } });
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault: () => { prevented += 1; } };
  for (const modifier of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
    link.props.onClick({ ...click, ...modifier });
  }
  assert.equal(navigations, 0);
  assert.equal(prevented, 0);
  link.props.onClick(click);
  assert.equal(navigations, 1);
  assert.equal(prevented, 1);
});


test("keyboard users can skip the sticky navigation to the focusable main", () => {
  const source = readFileSync(new URL("./PublicSite.tsx", import.meta.url), "utf8");
  assert.match(source, /href="#public-main">Skip to content/);
  assert.match(source, /<main id="public-main" tabIndex=\{-1\}>/);
  const css = readFileSync(new URL("./PublicSite.css", import.meta.url), "utf8");
  assert.match(css, /\.public-skip-link:focus\s*\{ transform: translateY\(0\)/);
});
