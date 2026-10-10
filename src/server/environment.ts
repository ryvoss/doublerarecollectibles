export const TEST_DATABASE_NAME = "double_rare_collectibles_test";

export function databaseName(connectionString: string | undefined): string {
  if (!connectionString) throw new Error("DATABASE_URL or DIRECT_DATABASE_URL is required.");
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!name) throw new Error("The configured PostgreSQL URL must name a database.");
  return name;
}

export function runtimeDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;

  if (databaseUrl && directDatabaseUrl) {
    const databaseUrlName = new URL(databaseUrl).pathname.slice(1);
    const directDatabaseUrlName = new URL(directDatabaseUrl).pathname.slice(1);
    // Prisma's local development listener uses a prisma+postgres URL without
    // a database path; DIRECT_DATABASE_URL remains the identity source there.
    if (databaseUrlName && directDatabaseUrlName &&
      decodeURIComponent(databaseUrlName) !== decodeURIComponent(directDatabaseUrlName)) {
      throw new Error("DATABASE_URL and DIRECT_DATABASE_URL must point to the same database.");
    }
  }

  // The pg adapter requires a normal PostgreSQL URL. Prefer the direct URL
  // when present, while Railway's standard DATABASE_URL works by itself.
  const connectionString = directDatabaseUrl ?? databaseUrl;
  if (!connectionString) throw new Error("DATABASE_URL or DIRECT_DATABASE_URL is required.");
  return connectionString;
}

export function migrationDatabaseUrl(): string {
  // A direct URL is preferred for migrations when a hosting provider supplies
  // both pooled and direct connections. Railway's single DATABASE_URL also works.
  runtimeDatabaseUrl();
  return process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
}

export function assertDatabaseEnvironment(): "REAL" | "TEST" {
  const mode = process.env.APP_ENV ?? "REAL";
  const name = databaseName(runtimeDatabaseUrl());
  if (mode === "TEST") {
    if (name !== TEST_DATABASE_NAME) throw new Error(`TEST must use database ${TEST_DATABASE_NAME}; configured database is ${name}.`);
    return "TEST";
  }
  if (mode !== "REAL") throw new Error("APP_ENV must be REAL or TEST.");
  if (name === TEST_DATABASE_NAME || /(^|_)test($|_)/i.test(name)) throw new Error("REAL API refuses to connect to a TEST database.");
  return "REAL";
}
