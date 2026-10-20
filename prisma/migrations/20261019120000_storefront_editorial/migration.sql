-- CreateTable
CREATE TABLE "StorefrontCategory" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StorefrontCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontCategoryProduct" (
    "categoryId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "StorefrontCategoryProduct_pkey" PRIMARY KEY ("categoryId","productId")
);

-- CreateTable
CREATE TABLE "StorefrontNewsPost" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "summary" VARCHAR(320) NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" VARCHAR(500),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontNewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontAnnouncement" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(240) NOT NULL,
    "imageUrl" VARCHAR(500),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "destination" VARCHAR(30) NOT NULL,
    "destinationSlug" VARCHAR(100),

    CONSTRAINT "StorefrontAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontCategory_slug_key" ON "StorefrontCategory"("slug");

-- CreateIndex
CREATE INDEX "StorefrontCategoryProduct_productId_idx" ON "StorefrontCategoryProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontNewsPost_slug_key" ON "StorefrontNewsPost"("slug");

-- CreateIndex
CREATE INDEX "StorefrontNewsPost_published_publishAt_idx" ON "StorefrontNewsPost"("published", "publishAt");

-- CreateIndex
CREATE INDEX "StorefrontAnnouncement_published_sortOrder_idx" ON "StorefrontAnnouncement"("published", "sortOrder");

-- AddForeignKey
ALTER TABLE "StorefrontCategoryProduct" ADD CONSTRAINT "StorefrontCategoryProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StorefrontCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontCategoryProduct" ADD CONSTRAINT "StorefrontCategoryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
