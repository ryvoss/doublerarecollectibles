import { randomUUID } from "node:crypto";
import { Router } from "express";
import { validatePublicContactSubmission } from "../../shared/publicContact";
import {
  ContactEmailDeliveryError,
  type ContactEmailService,
} from "../services/contactEmail";
import { logServerError } from "../security/logging";

const SUCCESS_RESPONSE = { ok: true, message: "Thanks. Your message has been sent." };
const VALIDATION_RESPONSE = { error: "Please check the form and try again." };
const UNAVAILABLE_RESPONSE = {
  error: "Your message could not be sent right now. Please try again later.",
};

export function createPublicContactRouter(emailService: ContactEmailService) {
  const router = Router();

  router.post("/", async (req, res) => {
    if (!req.is("application/json")) {
      res.status(400).json(VALIDATION_RESPONSE);
      return;
    }

    const validation = validatePublicContactSubmission(req.body);
    if (validation.kind === "invalid") {
      res.status(400).json(VALIDATION_RESPONSE);
      return;
    }
    if (validation.kind === "honeypot") {
      res.status(202).json(SUCCESS_RESPONSE);
      return;
    }

    const requestId = randomUUID();
    try {
      await emailService.send({
        name: validation.value.name,
        email: validation.value.email,
        topic: validation.value.topic,
        message: validation.value.message,
      });
      res.status(202).json(SUCCESS_RESPONSE);
    } catch {
      // Do not log the visitor's name, email, message, or request body.
      logServerError(
        `Contact delivery failed requestId=${requestId} topic=${validation.value.topic}`,
        new ContactEmailDeliveryError(),
      );
      res.status(503).json(UNAVAILABLE_RESPONSE);
    }
  });

  return router;
}
