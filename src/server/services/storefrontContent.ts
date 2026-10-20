import { prisma } from "../prisma";
import { toPublicNewsSummary, type PublicNewsArticle, type PublicNewsSummary, type ContentKind, type ContentUpdate, type StorefrontAnnouncement, type StorefrontCategory, type StorefrontContent, type StorefrontNewsPost } from "../../shared/storefrontContent";

export class StorefrontInputError extends Error {}
export type StorefrontRepository = {
  read: (includeArticleBodies?: boolean) => Promise<StorefrontContent>;
  listNewsPage: (page: number) => Promise<{ posts: PublicNewsSummary[]; hasMore: boolean }>;
  findNewsArticle: (slug: string) => Promise<PublicNewsArticle | null>;
  save: (kind: ContentKind, id: number | null, value: ContentUpdate) => Promise<void>;
  remove: (kind: ContentKind, id: number) => Promise<void>;
};

export function createStorefrontRepository(client: typeof prisma = prisma): StorefrontRepository { return {
  async read(includeArticleBodies = true) {
    const [categories, news, announcements] = await Promise.all([
      client.storefrontCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }], include: { products: { select: { productId: true } } } }),
      client.storefrontNewsPost.findMany({ orderBy: [{ publishAt: "desc" }, { id: "asc" }], select: { id: true, title: true, slug: true, summary: true, body: includeArticleBodies, imageUrl: true, published: true, publishAt: true } }),
      client.storefrontAnnouncement.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    ]);
    return {
      categories: categories.map(({ products, ...category }) => ({ ...category, productIds: products.map((product) => product.productId) })),
      news: news.map((post) => ({ ...post, body: post.body ?? "", publishAt: post.publishAt.toISOString() })),
      announcements: announcements.map((item) => ({ ...item, type: item.type as StorefrontAnnouncement["type"], destination: item.destination as StorefrontAnnouncement["destination"], startsAt: item.startsAt?.toISOString() ?? null, endsAt: item.endsAt?.toISOString() ?? null })),
    };
  },
  async listNewsPage(page) {
    const rows = await client.storefrontNewsPost.findMany({
      where: { published: true, publishAt: { lte: new Date() } },
      orderBy: [{ publishAt: "desc" }, { slug: "asc" }], skip: (page - 1) * 12, take: 13,
      select: { title: true, slug: true, summary: true, imageUrl: true, publishAt: true },
    });
    return { posts: rows.slice(0, 12).map((post) => toPublicNewsSummary({ ...post, publishAt: post.publishAt.toISOString() })), hasMore: rows.length > 12 };
  },
  async findNewsArticle(slug) {
    const post = await client.storefrontNewsPost.findFirst({
      where: { slug, published: true, publishAt: { lte: new Date() } },
      select: { title: true, slug: true, summary: true, body: true, imageUrl: true, publishAt: true },
    });
    return post ? { ...toPublicNewsSummary({ ...post, publishAt: post.publishAt.toISOString() }), body: post.body } : null;
  },
  async save(kind, id, value) {
    await client.$transaction(async (tx) => {
      if (kind === "categories") {
        const { productIds, ...data } = value as Omit<StorefrontCategory, "id">;
        const count = await tx.product.count({ where: { id: { in: productIds }, sellable: true } });
        if (count !== productIds.length) throw new StorefrontInputError("Choose existing sellable products");
        const products = { create: productIds.map((productId) => ({ productId })) };
        if (id === null) await tx.storefrontCategory.create({ data: { ...data, products } });
        else await tx.storefrontCategory.update({ where: { id }, data: { ...data, products: { deleteMany: {}, ...products } } });
      } else if (kind === "news") {
        const input = value as Omit<StorefrontNewsPost, "id">;
        const data = { ...input, publishAt: new Date(input.publishAt) };
        if (id === null) await tx.storefrontNewsPost.create({ data });
        else await tx.storefrontNewsPost.update({ where: { id }, data });
      } else {
        const input = value as Omit<StorefrontAnnouncement, "id">;
        if (input.destination === "CATEGORY") {
          const category = await tx.storefrontCategory.findUnique({ where: { slug: input.destinationSlug! } });
          if (!category || (input.published && !category.visible)) throw new StorefrontInputError("Choose an existing visible category before publishing");
        }
        if (input.destination === "NEWS") {
          const post = await tx.storefrontNewsPost.findUnique({ where: { slug: input.destinationSlug! } });
          if (!post || (input.published && !post.published)) throw new StorefrontInputError("Choose an existing published news article before publishing");
        }
        const data = { ...input, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null };
        if (id === null) await tx.storefrontAnnouncement.create({ data });
        else await tx.storefrontAnnouncement.update({ where: { id }, data });
      }
    });
  },
  async remove(kind, id) {
    // Cascading joins remove assignments only; Product and business records survive.
    if (kind === "categories") await client.storefrontCategory.delete({ where: { id } });
    else if (kind === "news") await client.storefrontNewsPost.delete({ where: { id } });
    else await client.storefrontAnnouncement.delete({ where: { id } });
  },
}; }

export const storefrontRepository = createStorefrontRepository();
