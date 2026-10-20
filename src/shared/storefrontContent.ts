import type { PublicInventoryItem } from "./publicInventory";

export const ANNOUNCEMENT_TYPES = ["NEWS", "NEW_RELEASE", "PRICE_DROP", "UPCOMING_SHOW", "STORE_UPDATE", "DEAL_PROMOTION"] as const;
export const CONTENT_DESTINATIONS = ["INVENTORY", "RECENT_DROPS", "CATEGORY", "SHOWS", "NEWS", "BUY_SELL_TRADE", "CONTACT"] as const;
export type ContentDestination = typeof CONTENT_DESTINATIONS[number];
export type StorefrontCategory = { id: number; name: string; slug: string; visible: boolean; sortOrder: number; productIds: number[] };
export type StorefrontNewsPost = { id: number; title: string; slug: string; summary: string; body: string; imageUrl: string | null; published: boolean; publishAt: string };
export type StorefrontAnnouncement = {
  id: number; type: typeof ANNOUNCEMENT_TYPES[number]; title: string; summary: string;
  imageUrl: string | null; published: boolean; sortOrder: number; startsAt: string | null; endsAt: string | null;
  destination: ContentDestination; destinationSlug: string | null;
};
export type StorefrontContent = { categories: StorefrontCategory[]; news: StorefrontNewsPost[]; announcements: StorefrontAnnouncement[] };
export type PublicCategory = Pick<StorefrontCategory, "name" | "slug" | "productIds">;
export type PublicNewsSummary = Pick<StorefrontNewsPost, "title" | "slug" | "summary" | "imageUrl" | "publishAt">;
export type PublicNewsArticle = PublicNewsSummary & { body: string };
export type PublicAnnouncement = Pick<StorefrontAnnouncement, "type" | "title" | "summary" | "imageUrl"> & { href: string; date: string | null; actionLabel?: string };
export type PublicEditorial = { categories: PublicCategory[]; announcements: PublicAnnouncement[] };
export const EMPTY_EDITORIAL: PublicEditorial = { categories: [], announcements: [] };
export type ContentKind = keyof StorefrontContent;
export type ContentUpdate = Omit<StorefrontCategory, "id"> | Omit<StorefrontNewsPost, "id"> | Omit<StorefrontAnnouncement, "id">;

export function contentDestinationPath(destination: ContentDestination, slug: string | null) {
  switch (destination) {
    case "INVENTORY": return "/inventory";
    case "RECENT_DROPS": return "/inventory?view=recent-drops";
    case "CATEGORY": return `/inventory?category=${encodeURIComponent(slug ?? "")}`;
    case "SHOWS": return "/shows";
    case "NEWS": return `/news/${encodeURIComponent(slug ?? "")}`;
    case "BUY_SELL_TRADE": return "/buy-sell-trade";
    case "CONTACT": return "/contact";
  }
}

export const validStorefrontSlug = (value: string) => value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

// Restrict editorial media to existing app-managed public images: no remote tracking or raw HTML.
export function validEditorialImage(value: string | null) {
  return value === null || /^\/api\/public\/(?:product-images\/[1-9]\d*|site-assets\/(?:primary-logo|hero-image))\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(value);
}

function validDate(value: unknown, nullable: boolean): boolean {
  return (nullable && value === null) || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
}

export function validateContent(kind: ContentKind, value: unknown): ContentUpdate | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Content must be an object";
  const input = value as Record<string, unknown>;
  const fields = kind === "categories"
    ? ["name", "slug", "visible", "sortOrder", "productIds"]
    : kind === "news" ? ["title", "slug", "summary", "body", "imageUrl", "published", "publishAt"]
      : ["type", "title", "summary", "imageUrl", "published", "sortOrder", "startsAt", "endsAt", "destination", "destinationSlug"];
  if (Object.keys(input).some((key) => !fields.includes(key)) || fields.some((key) => !(key in input))) return "Unknown or missing content field";
  const result = { ...input };
  const limits = kind === "categories" ? { name: 80, slug: 100 }
    : kind === "news" ? { title: 160, slug: 100, summary: 320, body: 20000 }
      : { title: 120, summary: 240 };
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].trim().length > limit) return `${key} is required and must be at most ${limit} characters`;
    result[key] = input[key].trim();
  }
  if ("slug" in input && !validStorefrontSlug(String(result.slug))) return "Use a lowercase slug with letters, numbers, and single hyphens";
  const booleanKey = kind === "categories" ? "visible" : "published";
  if (typeof input[booleanKey] !== "boolean") return `${booleanKey} must be true or false`;
  if (kind !== "news" && (!Number.isSafeInteger(input.sortOrder) || Number(input.sortOrder) < 0 || Number(input.sortOrder) > 100000)) return "Order must be a whole number from 0 to 100000";
  if (kind === "categories") {
    if (!Array.isArray(input.productIds) || input.productIds.length > 2000 || input.productIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) return "Choose valid product IDs";
    result.productIds = [...new Set(input.productIds)];
  } else {
    if (input.imageUrl !== null && typeof input.imageUrl !== "string") return "Choose an existing public image or leave blank";
    if (!validEditorialImage(input.imageUrl as string | null)) return "Choose an existing app-managed public image";
    if (kind === "news") {
      if (!validDate(input.publishAt, false)) return "Publish date must include a timezone";
      result.publishAt = new Date(input.publishAt as string).toISOString();
    } else {
      if (!ANNOUNCEMENT_TYPES.includes(input.type as StorefrontAnnouncement["type"])) return "Choose a supported announcement type";
      if (!CONTENT_DESTINATIONS.includes(input.destination as ContentDestination)) return "Choose a supported destination";
      if (!validDate(input.startsAt, true) || !validDate(input.endsAt, true)) return "Schedule must contain valid dates with timezones";
      if (input.startsAt && input.endsAt && Date.parse(String(input.startsAt)) >= Date.parse(String(input.endsAt))) return "End must be after start";
      const needsSlug = input.destination === "CATEGORY" || input.destination === "NEWS";
      if (needsSlug ? typeof input.destinationSlug !== "string" || !validStorefrontSlug(input.destinationSlug) : input.destinationSlug !== null) return "Choose a valid destination";
    }
  }
  return result as ContentUpdate;
}

export function publishedNews(posts: StorefrontNewsPost[], now = new Date()) {
  return posts.filter((post) => post.published && Date.parse(post.publishAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt) || a.slug.localeCompare(b.slug));
}

export function toPublicNews(post: StorefrontNewsPost): PublicNewsArticle {
  return { ...toPublicNewsSummary(post), body: post.body };
}

export function toPublicNewsSummary(post: PublicNewsSummary): PublicNewsSummary {
  return { title: post.title, slug: post.slug, summary: post.summary, imageUrl: post.imageUrl, publishAt: post.publishAt };
}

export function publicEditorial(content: StorefrontContent, publicProductIds: number[], now = new Date()): PublicEditorial {
  const allowedIds = new Set(publicProductIds);
  const categories = content.categories.filter((category) => category.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((category) => ({ name: category.name, slug: category.slug, productIds: category.productIds.filter((id) => allowedIds.has(id)) }));
  const newsSlugs = new Set(publishedNews(content.news, now).map((post) => post.slug));
  const categorySlugs = new Set(categories.map((category) => category.slug));
  const announcements = content.announcements.filter((item) => item.published &&
    (!item.startsAt || Date.parse(item.startsAt) <= now.getTime()) && (!item.endsAt || Date.parse(item.endsAt) > now.getTime()) &&
    (item.destination !== "CATEGORY" || categorySlugs.has(item.destinationSlug ?? "")) &&
    (item.destination !== "NEWS" || newsSlugs.has(item.destinationSlug ?? "")))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((item) => ({ type: item.type, title: item.title, summary: item.summary, imageUrl: item.imageUrl, href: contentDestinationPath(item.destination, item.destinationSlug), date: item.startsAt }));
  return { categories, announcements };
}

export type InventoryBrowseState = { search: string; category: string; view: string; availability: string };
export function inventoryBrowseState(search: string): InventoryBrowseState {
  const params = new URLSearchParams(search);
  return { search: params.get("q") ?? "", category: params.get("category") ?? "", view: params.get("view") === "recent-drops" ? "recent-drops" : "", availability: params.get("availability") ?? "ALL" };
}
export function filterStorefrontInventory(products: PublicInventoryItem[], state: InventoryBrowseState, categories: PublicCategory[]) {
  const category = categories.find((item) => item.slug === state.category);
  const ids = new Set(category?.productIds);
  return products.filter((product) => (!state.search.trim() || product.name.toLocaleLowerCase().includes(state.search.trim().toLocaleLowerCase())) &&
    (!state.category || (category && ids.has(product.id))) && (!state.view || product.recentPriceDrop) &&
    (state.availability === "ALL" || product.availability === state.availability));
}
