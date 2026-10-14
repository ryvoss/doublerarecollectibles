import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import { PUBLIC_SITE_DEFAULTS } from "../../shared/publicSite";
import {
  buildContactMethods,
  contactProductContext,
  ContactExperience,
  createContactInitialSubmission,
  HeaderContactAction,
  openProductContact,
} from "./ContactOptions";

// The node test transform uses the classic JSX runtime while Vite uses the
// automatic runtime configured for the application.
Object.assign(globalThis, { React });
const { createElement } = React;

const configuredSettings = {
  ...PUBLIC_SITE_DEFAULTS,
  contactEmail: "hello@doublerarecollectibles.com",
  instagramUrl: "https://www.instagram.com/doublerarecollectibles/",
};

const product: PublicInventoryItem = {
  id: 42,
  name: "CN Pris Box",
  shortDescription: "Sealed collector box",
  imageUrl: null,
  displayPrice: 100,
  featured: true,
  availability: "LOW_STOCK",
  moreArrivingSoon: false,
};

test("header renders a generic Contact action and invokes the shared opener", () => {
  const trigger = {} as HTMLButtonElement;
  let receivedTrigger: HTMLElement | undefined;
  const element = HeaderContactAction({
    onOpen: (received) => { receivedTrigger = received; },
  });
  const props = element.props as {
    onClick: (event: { currentTarget: HTMLButtonElement }) => void;
  };
  props.onClick({ currentTarget: trigger });
  assert.equal(receivedTrigger, trigger);

  const markup = renderToStaticMarkup(
    createElement(HeaderContactAction, { onOpen: () => undefined }),
  );
  assert.match(markup, /<button[^>]*public-contact-trigger[^>]*>Contact<\/button>/);
  assert.doesNotMatch(markup, /Instagram/);
});

test("product inquiries use the shared contact context and prefill the form", () => {
  const context = contactProductContext(product);
  const trigger = {} as HTMLButtonElement;
  let openedWith: { trigger: HTMLElement; product?: typeof context } | undefined;
  openProductContact((receivedTrigger, receivedProduct) => {
    openedWith = { trigger: receivedTrigger, product: receivedProduct };
  }, product, trigger);
  const initial = createContactInitialSubmission(context);
  const markup = renderToStaticMarkup(createElement(ContactExperience, {
    product: context,
    settings: configuredSettings,
    surface: "modal",
  }));

  assert.deepEqual(context, {
    name: "CN Pris Box",
    price: "$100.00",
    availability: "Low Stock",
    comingSoon: false,
  });
  assert.deepEqual(openedWith, { trigger, product: context });
  assert.equal(initial.topic, "PRODUCT_QUESTION");
  assert.match(initial.message, /CN Pris Box/);
  assert.match(markup, /value="PRODUCT_QUESTION" selected=""/);
  assert.match(markup, /CN Pris Box/);
});

test("email and Instagram alternatives only render when configured", () => {
  assert.deepEqual(
    buildContactMethods(configuredSettings).map(method => method.id),
    ["website", "email", "instagram"],
  );

  const withoutEmail = buildContactMethods({
    ...configuredSettings,
    contactEmail: "",
  });
  assert.deepEqual(withoutEmail.map(method => method.id), ["website", "instagram"]);

  const withoutInstagram = buildContactMethods({
    ...configuredSettings,
    instagramUrl: "",
  });
  assert.deepEqual(withoutInstagram.map(method => method.id), ["website", "email"]);

  const formOnly = renderToStaticMarkup(createElement(ContactExperience, {
    settings: { ...configuredSettings, contactEmail: "", instagramUrl: "" },
  }));
  assert.match(formOnly, /Send a message/);
  assert.doesNotMatch(formOnly, /mailto:/);
  assert.doesNotMatch(formOnly, /instagram\.com/);
});

test("contact links define branded states and visible keyboard focus", () => {
  const css = readFileSync(new URL("./ContactOptions.css", import.meta.url), "utf8");
  assert.match(css, /\.public-contact-method-link:link/);
  assert.match(css, /\.public-contact-method-link:visited/);
  assert.match(css, /\.public-contact-method-link:hover/);
  assert.match(css, /\.public-contact-method-link:active/);
  assert.match(css, /\.public-contact-method-link:focus-visible/);
  assert.doesNotMatch(css, /\b(?:blue|purple)\b/i);
});
