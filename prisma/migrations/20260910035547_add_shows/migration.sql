-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "showVisitId" INTEGER;

-- CreateTable
CREATE TABLE "Show" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowVisit" (
    "id" SERIAL NOT NULL,
    "showId" INTEGER NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "startingSinglesValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "endingSinglesValue" DECIMAL(10,2),
    "startingCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "endingCash" DECIMAL(10,2),
    "startingDigital" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "endingDigital" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "ShowVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Show_name_key" ON "Show"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShowVisit_showId_visitDate_key" ON "ShowVisit"("showId", "visitDate");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_showVisitId_fkey" FOREIGN KEY ("showVisitId") REFERENCES "ShowVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowVisit" ADD CONSTRAINT "ShowVisit_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
