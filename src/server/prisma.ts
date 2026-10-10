import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { assertDatabaseEnvironment, runtimeDatabaseUrl } from "./environment";

assertDatabaseEnvironment();

const adapter = new PrismaPg({
  connectionString: runtimeDatabaseUrl(),
});

export const prisma = new PrismaClient({
  adapter,
});
