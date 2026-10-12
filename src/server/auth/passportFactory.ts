import { Passport } from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import {
  createDummyPasswordHash,
  normalizeAdminUsername,
  verifyAdminPassword,
} from "./credentials";

export type AdminIdentity = {
  id: number;
  username: string;
  role: "ADMIN";
};

export type AdminAuthenticationRecord = AdminIdentity & {
  active: boolean;
  passwordHash: string;
};

type AdminAuthenticationRepository = {
  findById(id: number): Promise<AdminAuthenticationRecord | null>;
  findByUsername(username: string): Promise<AdminAuthenticationRecord | null>;
};

function identityFor(user: AdminAuthenticationRecord): AdminIdentity {
  return { id: user.id, username: user.username, role: user.role };
}

export function createAdminPassport(repository: AdminAuthenticationRepository) {
  const adminPassport = new Passport();
  const dummyPasswordHash = createDummyPasswordHash();

  adminPassport.use(new LocalStrategy(async (rawUsername, rawPassword, done) => {
    try {
      if (typeof rawUsername !== "string" || typeof rawPassword !== "string") {
        await verifyAdminPassword(await dummyPasswordHash, "invalid");
        return done(null, false);
      }

      const username = normalizeAdminUsername(rawUsername);
      if (!username || username.length > 100 || rawPassword.length > 256) {
        await verifyAdminPassword(await dummyPasswordHash, rawPassword.slice(0, 256));
        return done(null, false);
      }

      const user = await repository.findByUsername(username);
      const passwordHash = user?.passwordHash ?? await dummyPasswordHash;
      const passwordMatches = await verifyAdminPassword(passwordHash, rawPassword);
      if (!user || !user.active || !passwordMatches || user.role !== "ADMIN") {
        return done(null, false);
      }

      return done(null, identityFor(user));
    } catch (error) {
      return done(error);
    }
  }));

  adminPassport.serializeUser((user, done) => {
    done(null, user.id);
  });

  adminPassport.deserializeUser(async (id: unknown, done) => {
    try {
      if (!Number.isSafeInteger(id) || Number(id) <= 0) return done(null, false);
      const user = await repository.findById(Number(id));
      if (!user || !user.active || user.role !== "ADMIN") return done(null, false);
      return done(null, identityFor(user));
    } catch (error) {
      return done(error);
    }
  });

  return adminPassport;
}

export type AdminPassport = ReturnType<typeof createAdminPassport>;
