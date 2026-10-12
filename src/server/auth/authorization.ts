import type { RequestHandler } from "express";

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
};

export const requireAdminPage: RequestHandler = (req, res, next) => {
  const pathname = req.originalUrl.split("?", 1)[0];
  if (pathname === "/admin/login" || pathname?.startsWith("/admin/login/")) {
    next();
    return;
  }
  if (!req.isAuthenticated() || !req.user) {
    res.redirect(302, "/admin/login");
    return;
  }
  if (req.user.role !== "ADMIN") {
    res.status(403).type("text").send("Administrator access required");
    return;
  }
  next();
};
