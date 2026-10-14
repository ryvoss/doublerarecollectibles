import assert from "node:assert/strict";
import test from "node:test";
import {
  CTA_TARGET_PATHS,
  DEFAULT_HOMEPAGE_SECTIONS,
  PUBLIC_SITE_DEFAULTS,
  isAnnouncementActive,
  selectNearestUpcomingShow,
  visibleHomepageSectionKeys,
} from "./publicSite";

test("existing storefront defaults preserve a complete ordered homepage", () => {
  assert.deepEqual(PUBLIC_SITE_DEFAULTS.homepageSections, DEFAULT_HOMEPAGE_SECTIONS);
  assert.deepEqual(PUBLIC_SITE_DEFAULTS.homepageSections.map((section) => section.key), [
    "HERO", "MERCHANDISING", "COMING_SOON", "NEXT_SHOW", "BUY_SELL_TRADE", "CONTACT",
  ]);
  assert.equal(PUBLIC_SITE_DEFAULTS.homepageSections.find((section) => section.key === "COMING_SOON")?.visible, false);
  assert.equal(PUBLIC_SITE_DEFAULTS.homepageSections.find((section) => section.key === "HERO")?.visible, true);
});

test("homepage section visibility preserves configured ordering", () => {
  assert.deepEqual(visibleHomepageSectionKeys([
    { key: "CONTACT", visible: true },
    { key: "HERO", visible: false },
    { key: "COMING_SOON", visible: true },
    { key: "MERCHANDISING", visible: true },
    { key: "NEXT_SHOW", visible: false },
    { key: "BUY_SELL_TRADE", visible: true },
  ]), ["CONTACT", "COMING_SOON", "MERCHANDISING", "BUY_SELL_TRADE"]);
});

test("nearest public show selection ignores past dates and selects the earliest future visit", () => {
  const base = { venue: null, location: null, boothInfo: null, note: null };
  const selected = selectNearestUpcomingShow([
    { ...base, name: "Later", date: "2026-11-10T00:00:00.000Z" },
    { ...base, name: "Past", date: "2026-10-01T00:00:00.000Z" },
    { ...base, name: "Nearest", date: "2026-10-20T00:00:00.000Z" },
  ], new Date("2026-10-14T12:00:00.000Z"));
  assert.equal(selected?.name, "Nearest");
  assert.equal(selectNearestUpcomingShow([{ ...base, name: "Past", date: "2026-10-01T00:00:00.000Z" }], new Date("2026-10-14T12:00:00.000Z")), null);
});

test("CTA targets resolve only to predefined same-site routes", () => {
  assert.deepEqual(CTA_TARGET_PATHS, {
    INVENTORY: "/inventory",
    BUY_SELL_TRADE: "/buy-sell-trade",
    CONTACT: "/contact",
    SHOWS: "/shows",
  });
});

test("announcement visibility respects enablement and schedule", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  assert.equal(isAnnouncementActive({ announcementEnabled: true, announcementMessage: "New inventory", announcementStartsAt: null, announcementEndsAt: null }, now), true);
  assert.equal(isAnnouncementActive({ announcementEnabled: false, announcementMessage: "New inventory", announcementStartsAt: null, announcementEndsAt: null }, now), false);
  assert.equal(isAnnouncementActive({ announcementEnabled: true, announcementMessage: "New inventory", announcementStartsAt: "2026-10-15T00:00:00.000Z", announcementEndsAt: null }, now), false);
  assert.equal(isAnnouncementActive({ announcementEnabled: true, announcementMessage: "New inventory", announcementStartsAt: null, announcementEndsAt: "2026-10-13T00:00:00.000Z" }, now), false);
});
