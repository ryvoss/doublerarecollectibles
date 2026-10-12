import { randomBytes } from "node:crypto";
import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function normalizeAdminUsername(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function hashAdminPassword(password: string) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function createDummyPasswordHash() {
  return argon2.hash(randomBytes(32), ARGON2_OPTIONS);
}

export function verifyAdminPassword(passwordHash: string, password: string) {
  return argon2.verify(passwordHash, password);
}
