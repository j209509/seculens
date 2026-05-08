import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const u = await prisma.user.update({
  where: { email: "nugeirba@gmail.com" },
  data: { plan: "pro", role: "admin" },
});
console.log("updated:", u.email, "plan:", u.plan, "role:", u.role);
await prisma.$disconnect();
