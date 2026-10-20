import express from "express";
import path from "node:path";

/** Vite's default content-hashed assets are distinct from copied public files. */
export function frontendStatic(root: string) {
  return express.static(root, {
    index: false,
    maxAge: "1h",
    setHeaders(res, file) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      else if (/^assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-zA-Z0-9.]+$/.test(relative)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });
}
