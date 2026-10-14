import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import { openProductContact } from "./ContactOptions";
import { PublicInventoryCard } from "./PublicInventoryCard";
import {
  galleryImagesForProduct,
  nextGalleryIndex,
  ProductDetailContent,
  restoreProductDetailFocus,
} from "./ProductDetailModal";

Object.assign(globalThis, { React });

const product: PublicInventoryItem = {
  id: 42,
  name: "CN Pris Box",
  shortDescription: "A sealed collector box.",
  imageUrl: "/api/public/images/products/42/example.png",
  displayPrice: 100,
  compareAtPrice: null,
  recentPriceDrop: false,
  featured: true,
  availability: "LOW_STOCK",
  moreArrivingSoon: false,
};

type TestElementProps = {
  children?: React.ReactNode;
  className?: string;
  onClick?: (event: { currentTarget: HTMLButtonElement }) => void;
};

function findElement(
  node: React.ReactNode,
  className: string,
): React.ReactElement<TestElementProps> | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as React.ReactElement<TestElementProps>;
  if (element.props.className?.split(" ").includes(className)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const match = findElement(child, className);
    if (match) return match;
  }
  return undefined;
}

test("product card opens details while its explicit inquiry action stays independent", () => {
  const detailTrigger = {} as HTMLButtonElement;
  const contactTrigger = {} as HTMLButtonElement;
  let detailOpens = 0;
  let inquiries = 0;
  const card = PublicInventoryCard({
    product,
    onOpen: () => { detailOpens += 1; },
    onInterested: () => { inquiries += 1; },
  });

  const openButton = findElement(card, "public-catalog-card__open");
  const interestButton = findElement(card, "public-catalog-card__action");
  assert.ok(openButton?.props.onClick);
  assert.ok(interestButton?.props.onClick);

  openButton.props.onClick({ currentTarget: detailTrigger });
  assert.equal(detailOpens, 1);
  assert.equal(inquiries, 0);

  interestButton.props.onClick({ currentTarget: contactTrigger });
  assert.equal(detailOpens, 1);
  assert.equal(inquiries, 1);
});

test("product detail content shows only customer-facing product fields", () => {
  const markup = renderToStaticMarkup(React.createElement(ProductDetailContent, {
    product,
    onInterested: () => undefined,
  }));

  assert.match(markup, /CN Pris Box/);
  assert.match(markup, /\$100\.00/);
  assert.match(markup, /Low Stock/);
  assert.match(markup, /A sealed collector box\./);
  assert.match(markup, /example\.png/);
  assert.match(markup, /I’m interested/);
  assert.doesNotMatch(markup, /cost|cogs|margin|quantity|batch/i);
});

test("product card and detail mirror recent price-drop presentation", () => {
  const dropped = {
    ...product,
    displayPrice: 39,
    compareAtPrice: 45,
    recentPriceDrop: true,
    availability: "IN_STOCK" as const,
  };
  const cardMarkup = renderToStaticMarkup(React.createElement(PublicInventoryCard, {
    product: dropped,
    onOpen: () => undefined,
    onInterested: () => undefined,
  }));
  const detailMarkup = renderToStaticMarkup(React.createElement(ProductDetailContent, {
    product: dropped,
    onInterested: () => undefined,
  }));
  for (const markup of [cardMarkup, detailMarkup]) {
    assert.match(markup, /Recent Price Drop/);
    assert.match(markup, /\$39\.00/);
    assert.match(markup, /was \$45\.00/);
  }
});

test("Coming Soon stays primary and uses an arrival inquiry CTA", () => {
  const markup = renderToStaticMarkup(React.createElement(ProductDetailContent, {
    product: {
      ...product,
      availability: "COMING_SOON",
      recentPriceDrop: true,
      compareAtPrice: 125,
    },
    onInterested: () => undefined,
  }));
  assert.match(markup, /Coming Soon/);
  assert.doesNotMatch(markup, /Recent Price Drop/);
  assert.match(markup, /Arriving soon/);
  assert.match(markup, /Ask about arrival/);
});

test("product-detail inquiry uses the existing contact context", () => {
  let receivedName = "";
  openProductContact((_trigger, context) => {
    receivedName = context?.name ?? "";
  }, product, {} as HTMLButtonElement);
  assert.equal(receivedName, product.name);
});

test("gallery is honest for one stored image and navigation wraps when more arrive", () => {
  assert.deepEqual(galleryImagesForProduct(product), [{
    url: product.imageUrl,
    alt: product.name,
  }]);
  assert.equal(nextGalleryIndex(0, 1, 1), 0);
  assert.equal(nextGalleryIndex(0, 4, -1), 3);
  assert.equal(nextGalleryIndex(3, 4, 1), 0);
});

test("product detail restores focus and retains dialog accessibility behavior", async () => {
  let focused = false;
  restoreProductDetailFocus({ focus: () => { focused = true; } } as HTMLElement);
  await new Promise(resolve => globalThis.setTimeout(resolve, 5));
  assert.equal(focused, true);

  const source = readFileSync(new URL("./ProductDetailModal.tsx", import.meta.url), "utf8");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
});

test("logo and product modal styles retain content at phone and desktop sizes", () => {
  const siteCss = readFileSync(new URL("./PublicSite.css", import.meta.url), "utf8");
  const detailCss = readFileSync(new URL("./ProductDetailModal.css", import.meta.url), "utf8");

  assert.match(siteCss, /\.public-brand__mark img[\s\S]*max-width: 100%/);
  assert.match(siteCss, /\.public-brand__mark img[\s\S]*max-height: 100%/);
  assert.match(siteCss, /\.public-brand__mark img[\s\S]*object-fit: contain/);
  assert.match(siteCss, /@media \(max-width: 390px\)/);
  assert.match(detailCss, /height: calc\(100dvh - 8px\)/);
  assert.match(detailCss, /overflow-x: hidden/);
  assert.match(detailCss, /@media \(min-width: 768px\)/);
});
