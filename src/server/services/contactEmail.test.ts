import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createResendContactEmailService,
  type ContactEmailProviderPayload,
} from "./contactEmail";

test("Resend delivery uses only server configuration and a plain-text visitor message", async () => {
  const original = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.CONTACT_FORM_FROM_EMAIL,
    to: process.env.CONTACT_FORM_TO_EMAIL,
  };
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.CONTACT_FORM_FROM_EMAIL = "Double Rare Website <website@notify.example.com>";
  process.env.CONTACT_FORM_TO_EMAIL = "owner@example.com";

  let suppliedApiKey = "";
  let payload: ContactEmailProviderPayload | null = null;
  try {
    const service = createResendContactEmailService((apiKey) => ({
      async send(message) {
        suppliedApiKey = apiKey;
        payload = message;
        return { error: null };
      },
    }));
    await service.send({
      name: "Jane Smith",
      email: "jane@example.com",
      topic: "PRODUCT_QUESTION",
      message: "Is this product still available?",
    });
  } finally {
    if (original.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original.apiKey;
    if (original.from === undefined) delete process.env.CONTACT_FORM_FROM_EMAIL;
    else process.env.CONTACT_FORM_FROM_EMAIL = original.from;
    if (original.to === undefined) delete process.env.CONTACT_FORM_TO_EMAIL;
    else process.env.CONTACT_FORM_TO_EMAIL = original.to;
  }

  assert.equal(suppliedApiKey, "test-api-key");
  assert.deepEqual(payload, {
    from: "Double Rare Website <website@notify.example.com>",
    to: "owner@example.com",
    replyTo: "jane@example.com",
    subject: "[Website contact] Product question",
    text: [
      "New website contact submission",
      "",
      "Topic: Product question",
      "Name: Jane Smith",
      "Email: jane@example.com",
      "",
      "Message:",
      "Is this product still available?",
    ].join("\n"),
  });
  assert.equal(Object.hasOwn(payload ?? {}, "html"), false);
  assert.equal(Object.hasOwn(payload ?? {}, "cc"), false);
  assert.equal(Object.hasOwn(payload ?? {}, "bcc"), false);
});
