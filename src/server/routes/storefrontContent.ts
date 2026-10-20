import { Router } from "express";
import { publicEditorial, validStorefrontSlug, validateContent, type ContentKind } from "../../shared/storefrontContent";
import type { StorefrontRepository } from "../services/storefrontContent";
import { StorefrontInputError } from "../services/storefrontContent";
import { logServerError } from "../security/logging";

const kinds = new Set(["categories", "news", "announcements"]);
function contentKind(value: unknown): ContentKind | null { return typeof value === "string" && kinds.has(value) ? value as ContentKind : null; }
function recordId(value: unknown) { return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null; }

export function createStorefrontContentRouter(repository: StorefrontRepository) {
  const router = Router();
  router.get("/", async (_req, res, next) => {
    try { res.json(await repository.read()); } catch (error) { next(error); }
  });
  for (const method of ["post", "put"] as const) {
    router[method](method === "post" ? "/:kind" : "/:kind/:id", async (req, res, next) => {
      const kind = contentKind(req.params.kind);
      const id = method === "post" ? null : recordId((req.params as Record<string, string>).id);
      if (!kind || (method === "put" && !id)) return res.status(404).json({ error: "Content not found" });
      const value = validateContent(kind, req.body);
      if (typeof value === "string") return res.status(400).json({ error: value });
      try {
        await repository.save(kind, id, value);
        res.status(method === "post" ? 201 : 200).json({ ok: true });
      } catch (error) {
        if (error instanceof StorefrontInputError) return res.status(400).json({ error: error.message });
        const code = (error as { code?: string })?.code;
        if (code === "P2002") return res.status(409).json({ error: "This slug is already in use" });
        if (code === "P2025") return res.status(404).json({ error: "Content not found" });
        if (code === "P2003") return res.status(409).json({ error: "A selected product changed. Reload and try again." });
        next(error);
      }
    });
  }
  router.delete("/:kind/:id", async (req, res, next) => {
    const kind = contentKind(req.params.kind); const id = recordId(req.params.id);
    if (!kind || !id) return res.status(404).json({ error: "Content not found" });
    try { await repository.remove(kind, id); res.json({ ok: true }); }
    catch (error) {
      if ((error as { code?: string })?.code === "P2025") return res.status(404).json({ error: "Content not found" });
      next(error);
    }
  });
  return router;
}

export function createPublicEditorialRouter(repository: StorefrontRepository, publicProductIds: () => Promise<number[]>) {
  const router = Router();
  // Drafts, schedules, assignments to private Products, and admin IDs never enter these responses.
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.get("/editorial", async (_req, res) => {
    try {
      const [content, ids] = await Promise.all([repository.read(false), publicProductIds()]);
      res.json(publicEditorial(content, ids));
    } catch (error) { logServerError("Public editorial loading failed", error); res.status(503).json({ error: "Updates are temporarily unavailable" }); }
  });
  router.get("/news", async (req, res) => {
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return res.status(400).json({ error: "Invalid page" });
    try {
      res.json(await repository.listNewsPage(page));
    } catch (error) { logServerError("Public news loading failed", error); res.status(503).json({ error: "News is temporarily unavailable" }); }
  });
  router.get("/news/:slug", async (req, res) => {
    if (typeof req.params.slug !== "string" || !validStorefrontSlug(req.params.slug)) return res.status(404).json({ error: "Article not found" });
    try {
      const article = await repository.findNewsArticle(req.params.slug);
      if (!article) return res.status(404).json({ error: "Article not found" });
      res.json(article);
    } catch (error) { logServerError("Public article loading failed", error); res.status(503).json({ error: "News is temporarily unavailable" }); }
  });
  return router;
}
