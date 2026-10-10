import { raw, type RequestHandler } from "express";
import { MAX_PRODUCT_IMAGE_BYTES } from "../services/productImageStorage";

const imageBodyParser = raw({
  limit: MAX_PRODUCT_IMAGE_BYTES,
  type: () => true,
});

export const parseImageBody: RequestHandler = (req, res, next) => {
  imageBodyParser(req, res, (error) => {
    if (!error) return next();
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
      res.status(413).json({ error: "Images must be 8 MB or smaller" });
      return;
    }
    next(error);
  });
};
