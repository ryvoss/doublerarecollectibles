-- What-If scenarios are isolated analytical records with no foreign keys to
-- transactional business tables.
CREATE TABLE "WhatIfScenario" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "baseSource" VARCHAR(40) NOT NULL DEFAULT 'CURRENT_INVENTORY',
    "scenarioData" JSONB NOT NULL DEFAULT '{"lines":[]}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatIfScenario_pkey" PRIMARY KEY ("id")
);
