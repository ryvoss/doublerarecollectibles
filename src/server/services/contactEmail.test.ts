import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createResendContactEmailService,
  type ContactEmailMessage,
  type ContactEmailProviderPayload,
} from "./contactEmail";

async function captureEmail(message: ContactEmailMessage) {
  const original = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.CONTACT_FORM_FROM_EMAIL,
    to: process.env.CONTACT_FORM_TO_EMAIL,
  };
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.CONTACT_FORM_FROM_EMAIL = "website@notify.example.com";
  process.env.CONTACT_FORM_TO_EMAIL = "owner@example.com";

  let suppliedApiKey = "";
  const captured: { payload?: ContactEmailProviderPayload } = {};
  try {
    const service = createResendContactEmailService((apiKey) => ({
      async send(providerPayload) {
        suppliedApiKey = apiKey;
        captured.payload = providerPayload;
        return { error: null };
      },
    }));
    await service.send(message);
  } finally {
    if (original.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original.apiKey;
    if (original.from === undefined) delete process.env.CONTACT_FORM_FROM_EMAIL;
    else process.env.CONTACT_FORM_FROM_EMAIL = original.from;
    if (original.to === undefined) delete process.env.CONTACT_FORM_TO_EMAIL;
    else process.env.CONTACT_FORM_TO_EMAIL = original.to;
  }
  assert.ok(captured.payload);
  return { payload: captured.payload, suppliedApiKey };
}

test("Resend delivery uses branded From, named Reply-To, HTML, and text fallback", async () => {
  const { payload, suppliedApiKey } = await captureEmail({
    name: "Jane Smith",
    email: "jane@example.com",
    topic: "PRODUCT_QUESTION",
    message: "Is this product still available?",
  });

  assert.equal(suppliedApiKey, "test-api-key");
  assert.equal(payload.from, "Double Rare Collectibles <website@notify.example.com>");
  assert.equal(payload.to, "owner@example.com");
  assert.equal(payload.replyTo, '"Jane Smith" <jane@example.com>');
  assert.equal(payload.subject, "[Website contact] Product question");
  assert.equal(payload.text, [
    "New website contact",
    "",
    "Topic: Product question",
    "Name: Jane Smith",
    "Email: jane@example.com",
    "",
    "Message:",
    "Is this product still available?",
    "",
    "Sent from doublerarecollectibles.com",
  ].join("\n"));
  assert.match(payload.html, /Double Rare Collectibles/);
  assert.match(payload.html, /New website contact/);
  assert.match(payload.html, /Product question/);
  assert.match(payload.html, /Jane Smith/);
  assert.match(payload.html, /jane@example\.com/);
  assert.match(payload.html, /Is this product still available\?/);
  assert.match(payload.html, /Sent from doublerarecollectibles\.com/);
  assert.equal(Object.hasOwn(payload, "cc"), false);
  assert.equal(Object.hasOwn(payload, "bcc"), false);
});

test("visitor values are HTML-escaped before email rendering", async () => {
  const { payload } = await captureEmail({
    name: 'Jane <Admin> "J"',
    email: "jane@example.com",
    topic: "GENERAL",
    message: '<script>alert("x")</script>\nTom & Jerry\'s cards',
  });

  assert.equal(payload.replyTo, '"Jane <Admin> \\"J\\"" <jane@example.com>');
  assert.match(payload.html, /Jane &lt;Admin&gt; &quot;J&quot;/);
  assert.match(payload.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;<br>Tom &amp; Jerry&#39;s cards/);
  assert.doesNotMatch(payload.html, /<script>|<Admin>/);
});
