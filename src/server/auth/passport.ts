import { prisma } from "../prisma";
import { createAdminPassport } from "./passportFactory";

export const passport = createAdminPassport({
  findById: (id) => prisma.adminUser.findUnique({ where: { id } }),
  findByUsername: (username) => prisma.adminUser.findUnique({ where: { username } }),
});
