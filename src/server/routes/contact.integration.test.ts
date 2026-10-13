import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { createPublicContactRouter } from "./contact";
import {
  createContactSubmissionLimiter,
  createSameOriginWriteProtection,
  noStore,
} from "../security/httpSecurity";
import { safeErrorHandler } from "../security/errorHandler";
import type { ContactEmailMessage, ContactEmailService } from "../services/contactEmail";

const testOrigin = "http://localhost:3003";
const validSubmission = {
  name: "Jane Smith",
  email: "jane@example.com",
  topic: "SELLING",
  message: "I have a collection I would like to discuss.",
  companyWebsite: "",
};

function createTestApplication(
  emailService: ContactEmailService,
  options: { rateLimit?: boolean } = {},
) {
  const app = express();
  app.use(express.json({ limit: "256kb", strict: true }));
  if (options.rateLimit !== false) {
    app.use("/api/public/contact", createContactSubmissionLimiter());
  }
  app.use(
    "/api/public/contact",
    noStore,
    createSameOriginWriteProtection(new Set([testOrigin])),
    createPublicContactRouter(emailService),
  );
  app.use(safeErrorHandler);
  return app;
}

function recordingEmailService() {
  const sent: ContactEmailMessage[] = [];
  const service: ContactEmailService = {
    async send(message) {
      sent.push(message);
    },
  };
  return { sent, service };
}

test("valid public contact submission is delivered without authentication", async () => {
  const { sent, service } = recordingEmailService();
  const response = await request(createTestApplication(service))
    .post("/api/public/contact")
    .set("Origin", testOrigin)
    .send({ ...validSubmission, name: "  Jane Smith  " })
    .expect(202);

  assert.deepEqual(response.body, { ok: true, message: "Thanks. Your message has been sent." });
  assert.match(response.headers["cache-control"], /no-store/);
  assert.deepEqual(sent, [{
    name: "Jane Smith",
    email: validSubmission.email,
    topic: validSubmission.topic,
    message: validSubmission.message,
  }]);
});

for (const [description, change] of [
  ["invalid email", { email: "not-an-email" }],
  ["invalid topic", { topic: "OTHER" }],
  ["too-short message", { message: "Too short" }],
] as const) {
  test(`${description} receives the generic validation response`, async () => {
    const { sent, service } = recordingEmailService();
    const response = await request(createTestApplication(service))
      .post("/api/public/contact")
      .set("Origin", testOrigin)
      .send({ ...validSubmission, ...change })
      .expect(400);

    assert.deepEqual(response.body, { error: "Please check the form and try again." });
    assert.equal(sent.length, 0);
    assert.doesNotMatch(JSON.stringify(response.body), /jane|collection|not-an-email/i);
  });
}

test("unknown properties are rejected without exposing submitted values", async () => {
  const { sent, service } = recordingEmailService();
  const response = await request(createTestApplication(service))
    .post("/api/public/contact")
    .set("Origin", testOrigin)
    .send({ ...validSubmission, recipient: "attacker@example.com", apiKey: "secret-value" })
    .expect(400);

  assert.deepEqual(response.body, { error: "Please check the form and try again." });
  assert.equal(sent.length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /attacker|secret|recipient|apiKey/i);
});

test("header control-character injection is rejected before delivery", async () => {
  const { sent, service } = recordingEmailService();
  const response = await request(createTestApplication(service))
    .post("/api/public/contact")
    .set("Origin", testOrigin)
    .send({ ...validSubmission, name: "Jane Smith\r\nBcc: attacker@example.com" })
    .expect(400);

  assert.deepEqual(response.body, { error: "Please check the form and try again." });
  assert.equal(sent.length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /attacker|bcc|jane/i);
});

test("honeypot submissions receive success without sending email", async () => {
  const { sent, service } = recordingEmailService();
  const response = await request(createTestApplication(service))
    .post("/api/public/contact")
    .set("Origin", testOrigin)
    .send({ ...validSubmission, companyWebsite: "https://spam.invalid" })
    .expect(202);

  assert.deepEqual(response.body, { ok: true, message: "Thanks. Your message has been sent." });
  assert.equal(sent.length, 0);
});

test("provider failures receive a generic 503 without sensitive fields", async () => {
  const app = createTestApplication({
    async send() {
      throw new Error("provider failure involving jane@example.com and secret-key");
    },
  });
  const logged: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => logged.push(values);
  let response: request.Response;
  try {
    response = await request(app)
      .post("/api/public/contact")
      .set("Origin", testOrigin)
      .send(validSubmission)
      .expect(503);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(response.body, {
    error: "Your message could not be sent right now. Please try again later.",
  });
  assert.doesNotMatch(JSON.stringify(response.body), /jane|collection|secret|provider/i);
  assert.doesNotMatch(JSON.stringify(logged), /jane@example|collection|secret-key/i);
});

test("unexpected origins are rejected before delivery", async () => {
  const { sent, service } = recordingEmailService();
  await request(createTestApplication(service))
    .post("/api/public/contact")
    .set("Origin", "https://attacker.invalid")
    .send(validSubmission)
    .expect(403, { error: "Cross-origin requests are not allowed" });
  assert.equal(sent.length, 0);
});

test("contact submissions are limited to five attempts per fifteen minutes", async () => {
  const { sent, service } = recordingEmailService();
  const app = createTestApplication(service);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app)
      .post("/api/public/contact")
      .set("Origin", testOrigin)
      .send(validSubmission)
      .expect(202);
  }
  await request(app)
    .post("/api/public/contact")
    .set("Origin", testOrigin)
    .send(validSubmission)
    .expect(429, { error: "Too many requests. Try again later." });
  assert.equal(sent.length, 5);
});
