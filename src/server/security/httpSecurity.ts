import type { RequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error("APP_ORIGIN must be an absolute HTTP or HTTPS origin.");
  }
}

export function allowedApplicationOrigins(production: boolean, port: number) {
  const configured = process.env.APP_ORIGIN?.trim() || (
    production && process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}`
      : undefined
  );
  if (configured) return new Set([normalizeOrigin(configured)]);
  if (production) {
    throw new Error("APP_ORIGIN is required in production for same-origin write protection.");
  }
  return new Set([
    `http://localhost:${port}`,
    "http://localhost:5173",
    `http://127.0.0.1:${port}`,
    "http://127.0.0.1:5173",
  ]);
}

export function createSameOriginWriteProtection(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const suppliedOrigin = req.get("Origin");
    if (!suppliedOrigin) {
      res.status(403).json({ error: "A valid same-origin request is required" });
      return;
    }
    let normalized: string;
    try {
      normalized = normalizeOrigin(suppliedOrigin);
    } catch {
      res.status(403).json({ error: "A valid same-origin request is required" });
      return;
    }
    if (!allowedOrigins.has(normalized)) {
      res.status(403).json({ error: "Cross-origin requests are not allowed" });
      return;
    }
    next();
  };
}

export const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  next();
};

export function securityHeaders(production: boolean) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-origin" },
    frameguard: { action: "deny" },
    hsts: production
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}

export const permissionsPolicy: RequestHandler = (_req, res, next) => {
  res.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  next();
};

const rateLimitResponse = { error: "Too many requests. Try again later." };

export function createContactSubmissionLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: rateLimitResponse,
  });
}

export const contactSubmissionLimiter = createContactSubmissionLimiter();

export const authenticatedApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1_500,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.user?.id ?? "unknown"}`,
  message: rateLimitResponse,
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/product-images/") || req.path.startsWith("/site-assets/"),
  message: rateLimitResponse,
});

export const publicImageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitResponse,
});
