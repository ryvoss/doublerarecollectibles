export const TEST_DATABASE_NAME = "double_rare_collectibles_test";

export function databaseName(connectionString: string | undefined): string {
  if (!connectionString) throw new Error("DIRECT_DATABASE_URL is required.");
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!name) throw new Error("DIRECT_DATABASE_URL must name a database.");
  return name;
}

export function assertDatabaseEnvironment(): "REAL" | "TEST" {
  const mode = process.env.APP_ENV ?? "REAL";
  const name = databaseName(process.env.DIRECT_DATABASE_URL);
  if (mode === "TEST") {
    if (name !== TEST_DATABASE_NAME) throw new Error(`TEST must use database ${TEST_DATABASE_NAME}; configured database is ${name}.`);
    return "TEST";
  }
  if (mode !== "REAL") throw new Error("APP_ENV must be REAL or TEST.");
  if (name === TEST_DATABASE_NAME || /(^|_)test($|_)/i.test(name)) throw new Error("REAL API refuses to connect to a TEST database.");
  return "REAL";
}
