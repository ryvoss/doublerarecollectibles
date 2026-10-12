import { csrfSync } from "csrf-sync";
import type { RequestHandler } from "express";

const csrf = csrfSync({
  size: 32,
  errorConfig: {
    statusCode: 403,
    message: "Invalid CSRF token",
    code: "INVALID_CSRF_TOKEN",
  },
});

export const requireValidCsrf: RequestHandler = (req, res, next) => {
  csrf.csrfSynchronisedProtection(req, res, (error) => {
    if (error) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }
    next();
  });
};

export const generateCsrfToken = csrf.generateToken;
export const revokeCsrfToken = csrf.revokeToken;
