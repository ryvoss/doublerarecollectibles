CREATE TABLE "WhatIfScenarioLine" (
    "id" SERIAL NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitSalePrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatIfScenarioLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatIfScenarioLine_scenarioId_idx" ON "WhatIfScenarioLine"("scenarioId");
CREATE UNIQUE INDEX "WhatIfScenarioLine_scenarioId_productId_key" ON "WhatIfScenarioLine"("scenarioId", "productId");
ALTER TABLE "WhatIfScenarioLine" ADD CONSTRAINT "WhatIfScenarioLine_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "WhatIfScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
