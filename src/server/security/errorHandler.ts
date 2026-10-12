import type { ErrorRequestHandler } from "express";
import { logServerError } from "./logging";

export const safeErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  if (res.headersSent) return;
  const status = typeof error === "object" && error !== null && "status" in error
    ? Reflect.get(error, "status")
    : undefined;
  const type = typeof error === "object" && error !== null && "type" in error
    ? Reflect.get(error, "type")
    : undefined;
  if (status === 413 || type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large" });
    return;
  }
  if (status === 400 || type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON request body" });
    return;
  }
  logServerError(`Unhandled request error for ${req.method} ${req.originalUrl}`, error);
  if (req.originalUrl.startsWith("/api/")) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  res.status(500).type("text").send("Internal server error");
};
