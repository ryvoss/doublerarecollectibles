import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnouncementCard, AnnouncementRail, CategoryNavigation, HorizontalRail, NewsArticle, ShowCard } from "./StorefrontSections";
import { PublicInventoryCard } from "./PublicInventoryCard";
import { PriceDisplay } from "./PriceDisplay";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import { publicEditorial, type StorefrontContent } from "../../shared/storefrontContent";
Object.assign(globalThis, { React });

test("editorial rail is a keyboard-focusable labeled region with real destination links", () => {
  const item = { type: "PRICE_DROP" as const, title: "Lower prices", summary: "Take a look", imageUrl: null, href: "/inventory?view=recent-drops", date: null };
  const markup = renderToStaticMarkup(<AnnouncementRail items={[item]} onNavigate={() => undefined} />);
  assert.match(markup, /role="region" aria-label="Announcements and updates" tabindex="0"/);
  assert.match(markup, /href="\/inventory\?view=recent-drops"/);
  assert.match(markup, /Price drop/);
  assert.equal(renderToStaticMarkup(<AnnouncementRail items={[]} onNavigate={() => undefined} />), "");
  assert.match(renderToStaticMarkup(<HorizontalRail label="Updates">Content</HorizontalRail>), /tabindex="0"/);
  assert.doesNotMatch(renderToStaticMarkup(<AnnouncementCard item={item} preview onNavigate={() => undefined} />), /<a /);
});

test("What's New renders both sources and hides when neither source has public content", () => {
  const content: StorefrontContent = {
    categories: [],
    announcements: [{ id: 1, type: "PRICE_DROP", title: "Gem 4 price reduced", summary: "See the latest price", imageUrl: null,
      published: true, sortOrder: 0, startsAt: null, endsAt: null, destination: "RECENT_DROPS", destinationSlug: null }],
    news: [{ id: 2, title: "Crystal Gathering inventory update", slug: "crystal-gathering", summary: "Our collector update", body: "Article body must not appear in the rail", imageUrl: null, published: true, publishAt: "2026-10-18T00:00:00Z" }],
  };
  const now = new Date("2026-10-19T12:00:00Z");
  const render = (source: StorefrontContent) => renderToStaticMarkup(<AnnouncementRail items={publicEditorial(source, [], now).activity} onNavigate={() => undefined} />);
  const markup = render(content);
  assert.match(markup, /What’s New at Double Rare/);
  assert.match(markup, /Gem 4 price reduced/);
  assert.match(markup, /Crystal Gathering inventory update/);
  assert.match(markup, /href="\/news\/crystal-gathering"/);
  assert.match(markup, /Oct 18, 2026/);
  assert.doesNotMatch(markup, /Article body must not appear/);
  assert.equal(render({ categories: [], news: [], announcements: [] }), "");
  assert.equal(render({ ...content, news: content.news.map((post) => ({ ...post, published: false })), announcements: content.announcements.map((item) => ({ ...item, published: false })) }), "");
});

test("category navigation always offers All Inventory and clearly marks the current category", () => {
  const markup = renderToStaticMarkup(<CategoryNavigation categories={[{ name: "Booster Boxes", slug: "booster-boxes", productIds: [1] }]} active="booster-boxes" onNavigate={() => undefined} />);
  assert.match(markup, /href="\/inventory">All inventory/);
  assert.match(markup, /href="\/inventory\?category=booster-boxes"[^>]*aria-current="page"/);
});

test("news content renders as escaped plain text rather than executable HTML", () => {
  const markup = renderToStaticMarkup(<NewsArticle post={{ title: "<script>alert(1)</script>", slug: "test", summary: "A summary", imageUrl: null, publishAt: "2026-10-24T00:00:00Z", body: "<img src=x onerror=alert(1)>\n\nNext paragraph" }} />);
  assert.doesNotMatch(markup, /<script|<img src=x/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /&lt;img/);
  assert.match(markup, /Oct 24, 2026/);
  assert.match(markup, /<p>Next paragraph<\/p>/);
});

test("show cards use the calendar date in UTC and never render internal metrics", () => {
  const show = { name: "Collector Expo", date: "2026-10-24T00:00:00Z", venue: "Hall", location: "St. Louis, MO", boothInfo: "Table 18", note: "Come say hello", revenue: 99999, funds: 4000, startingSinglesCash: 1234 };
  const markup = renderToStaticMarkup(<ShowCard show={show} nearest onNavigate={() => undefined} />);
  assert.match(markup, /<span>Oct<\/span><strong>24<\/strong>/);
  assert.match(markup, /Table 18/);
  assert.doesNotMatch(markup, /99999|4000|1234|revenue|funds|Singles/);
});

test("product cards prioritize name and price, then status, without inventing comparisons", () => {
  const product: PublicInventoryItem = { id: 1, name: "Booster Box", shortDescription: "Details belong in the modal", imageUrl: null, displayPrice: 39, compareAtPrice: 45, recentPriceDrop: true, featured: true, availability: "IN_STOCK", moreArrivingSoon: false };
  const markup = renderToStaticMarkup(<PublicInventoryCard product={product} onOpen={() => undefined} onInterested={() => undefined} />);
  assert.ok(markup.indexOf("<h2>") < markup.indexOf("$39.00"));
  assert.ok(markup.indexOf("$39.00") < markup.indexOf("Recent Price Drop"));
  assert.match(markup, /was \$45.00/);
  assert.doesNotMatch(markup, /Details belong in the modal/);
  const price = renderToStaticMarkup(<PriceDisplay price={39} compareAtPrice={45} recentPriceDrop={false} className="price" />);
  assert.doesNotMatch(price, /45|<del/);
});
