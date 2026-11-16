// In-memory adapter for route/security/UI tests only. No database connections.
import type { PrismaClient } from "../../generated/prisma/client";
type Row = Record<string, unknown> & { id: number; createdAt: Date; updatedAt: Date; lines: unknown[] };
type Args = { where?: { id?: number; updatedAt?: Date }; data?: Record<string, unknown> & { lines: { create: unknown[] } } };
export function orderWhatIfTestDatabase() {
  const records = new Map<number, Row>(); let id = 0, tick = Date.now(); let writes = 0;
  const clone = (row: Row) => structuredClone(row);
  const delegate = {
    findMany: async () => [...records.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(clone),
    findUnique: async ({ where }: Args) => records.has(where!.id!) ? clone(records.get(where!.id!)!) : null,
    create: async ({ data }: Args) => {
      const now = new Date(++tick), row = { ...data, id: ++id, createdAt: now, updatedAt: now, lines: data!.lines.create } as Row;
      records.set(row.id, row); writes++; return clone(row);
    },
    update: async ({ where, data }: Args) => {
      const current = records.get(where!.id!);
      if (!current || current.updatedAt.getTime() !== where!.updatedAt!.getTime()) throw Object.assign(new Error("Stale scenario"), { code: "P2025" });
      const row = { ...current, ...data, lines: data!.lines.create, updatedAt: new Date(++tick) };
      records.set(row.id, row); writes++; return clone(row);
    },
    deleteMany: async ({ where }: Args) => {
      const current = records.get(where!.id!);
      if (!current || current.updatedAt.getTime() !== where!.updatedAt!.getTime()) return { count: 0 };
      records.delete(current.id); writes++; return { count: 1 };
    },
  };
  const database = new Proxy({ orderWhatIfScenario: delegate }, { get(target, property) {
    if (property !== "orderWhatIfScenario") throw new Error(`Forbidden operational database access: ${String(property)}`);
    return target.orderWhatIfScenario;
  } }) as unknown as Pick<PrismaClient, "orderWhatIfScenario">;
  return { database, records, writeCount: () => writes };
}
