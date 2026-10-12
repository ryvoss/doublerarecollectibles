import "dotenv/config";

import { prisma } from "../src/server/prisma";
import {
  hashAdminPassword,
  normalizeAdminUsername,
} from "../src/server/auth/credentials";

async function main() {
  const confirmation = process.env.ADMIN_BOOTSTRAP_CONFIRM;
  const rawUsername = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const ifConfigured = process.argv.includes("--if-configured");

  // The Railway pre-deploy hook is inert unless all bootstrap variables are
  // deliberately supplied. A partial configuration fails closed.
  if (ifConfigured && !confirmation && !rawUsername && !password) {
    console.log("Initial ADMIN bootstrap was not requested.");
    return;
  }

  // Remove the plaintext password from the process environment as soon as the
  // script has copied it into memory. It is never included in output.
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (confirmation !== "CREATE_INITIAL_ADMIN") {
    throw new Error("Set ADMIN_BOOTSTRAP_CONFIRM=CREATE_INITIAL_ADMIN to run this one-time command.");
  }
  if (!rawUsername) throw new Error("ADMIN_BOOTSTRAP_USERNAME is required.");
  if (!password) throw new Error("ADMIN_BOOTSTRAP_PASSWORD is required.");

  const username = normalizeAdminUsername(rawUsername);
  if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
    throw new Error("Admin username must be 3-100 characters using letters, numbers, dot, underscore, or hyphen.");
  }
  if (password.length < 14 || password.length > 256) {
    throw new Error("Admin password must be between 14 and 256 characters.");
  }

  const passwordHash = await hashAdminPassword(password);
  await prisma.$transaction(async (tx) => {
    const existingAdmins = await tx.adminUser.count();
    if (existingAdmins !== 0) {
      throw new Error("An admin account already exists; initial bootstrap refused.");
    }
    await tx.adminUser.create({
      data: { username, passwordHash, role: "ADMIN" },
    });
  });

  console.log(`Initial ADMIN account created for ${username}.`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error";
    console.error(`Admin bootstrap failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
