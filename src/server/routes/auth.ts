import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sessionCookieClearOptions, sessionCookieName } from "../auth/config";
import type { AdminIdentity, AdminPassport } from "../auth/passportFactory";
import type { RequestHandler } from "express";
import { requireAdmin } from "../auth/authorization";
import { generateCsrfToken, revokeCsrfToken } from "../security/csrf";
import { logServerError } from "../security/logging";

export function createAuthRouter({
  adminPassport,
  onSuccessfulLogin,
  production,
  csrfProtection,
  originProtection,
}: {
  adminPassport: AdminPassport;
  onSuccessfulLogin?: (user: AdminIdentity) => Promise<void>;
  production: boolean;
  csrfProtection: RequestHandler;
  originProtection: RequestHandler;
}) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "Too many login attempts. Try again later." },
  });

  router.post("/login", loginLimiter, originProtection, (req, res, next) => {
    adminPassport.authenticate(
      "local",
      (error: unknown, user: AdminIdentity | false, _info: unknown) => {
        void _info;
        if (error) return next(error);
        if (!user) return res.status(401).json({ error: "Invalid username or password" });

        // Discard any pre-login session identifier before attaching the user.
        req.session.regenerate((regenerateError) => {
          if (regenerateError) return next(regenerateError);
          req.logIn(user, (loginError) => {
            if (loginError) return next(loginError);
            req.session.save(async (saveError) => {
              if (saveError) return next(saveError);
              if (onSuccessfulLogin) {
                await onSuccessfulLogin(user).catch((lastLoginError) => {
                  logServerError("Admin last-login timestamp could not be saved", lastLoginError);
                });
              }
              return res.json({
                authenticated: true,
                user: { id: user.id, username: user.username, role: user.role },
              });
            });
          });
        });
      },
    )(req, res, next);
  });

  router.get("/session", (req, res) => {
    if (!req.isAuthenticated() || !req.user || req.user.role !== "ADMIN") {
      return res.json({ authenticated: false, user: null });
    }
    return res.json({
      authenticated: true,
      user: { id: req.user.id, username: req.user.username, role: req.user.role },
    });
  });

  router.get("/csrf", requireAdmin, (req, res) => {
    res.json({ csrfToken: generateCsrfToken(req) });
  });

  router.post("/logout", requireAdmin, originProtection, csrfProtection, (req, res, next) => {
    const clearCookie = () => {
      res.clearCookie(sessionCookieName(production), sessionCookieClearOptions(production));
      res.status(204).end();
    };

    if (!req.session) {
      clearCookie();
      return;
    }

    revokeCsrfToken(req);
    req.logout((logoutError) => {
      if (logoutError) return next(logoutError);
      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        clearCookie();
      });
    });
  });

  return router;
}
