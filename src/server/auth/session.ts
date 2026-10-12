import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { Pool } from "pg";
import { runtimeDatabaseUrl } from "../environment";
import {
  SESSION_TTL_SECONDS,
  sessionCookieName,
  sessionCookieOptions,
  sessionSecret,
} from "./config";
import { logServerError } from "../security/logging";

const PgSessionStore = connectPgSimple(session);

export const adminSessionPool = new Pool({
  connectionString: runtimeDatabaseUrl(),
});

export function createAdminSessionMiddleware(production: boolean) {
  const store = new PgSessionStore({
    pool: adminSessionPool,
    tableName: "admin_session",
    createTableIfMissing: false,
    ttl: SESSION_TTL_SECONDS,
    pruneSessionInterval: 15 * 60,
    errorLog: (error) => logServerError("Admin session store error", error),
  });

  return session({
    name: sessionCookieName(production),
    secret: sessionSecret(),
    store,
    cookie: sessionCookieOptions(production),
    resave: false,
    rolling: false,
    saveUninitialized: false,
    unset: "destroy",
  });
}
