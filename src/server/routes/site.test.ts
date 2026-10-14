import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_SITE_DEFAULTS } from "../../shared/publicSite";
import { validatePublicShowUpdate, validateStorefrontSettings } from "./site";

test("storefront settings accept defaults and preserve reordered sections", () => {
  const reordered = [...PUBLIC_SITE_DEFAULTS.homepageSections].reverse();
  const result = validateStorefrontSettings({ ...PUBLIC_SITE_DEFAULTS, homepageSections: reordered });
  assert.notEqual(typeof result, "string");
  if (typeof result !== "string") assert.deepEqual(result.homepageSections, reordered);
});

test("storefront settings reject unknown fields, unsafe CTA targets, and invalid schedules", () => {
  assert.equal(validateStorefrontSettings({ ...PUBLIC_SITE_DEFAULTS, extra: true }), "Unknown site setting");
  assert.equal(validateStorefrontSettings({ ...PUBLIC_SITE_DEFAULTS, primaryCtaTarget: "javascript:alert(1)" }), "primaryCtaTarget must be a supported destination");
  assert.equal(validateStorefrontSettings({
    ...PUBLIC_SITE_DEFAULTS,
    announcementStartsAt: "2026-10-16T00:00:00.000Z",
    announcementEndsAt: "2026-10-15T00:00:00.000Z",
  }), "Announcement end must be after its start");
});

test("public show settings are strict and trim customer-safe copy", () => {
  assert.deepEqual(validatePublicShowUpdate({
    publicVisible: true,
    venue: "  Convention Center ",
    location: "Chicago, IL",
    boothInfo: "Table 12",
    publicNote: "North entrance",
  }), {
    publicVisible: true,
    venue: "Convention Center",
    location: "Chicago, IL",
    boothInfo: "Table 12",
    publicNote: "North entrance",
  });
  assert.equal(validatePublicShowUpdate({ publicVisible: true, venue: null, location: null, boothInfo: null, publicNote: null, internalRevenue: 50 }), "Unknown public show setting");
});
