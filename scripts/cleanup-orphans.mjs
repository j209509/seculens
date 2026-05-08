// Run via: fly ssh console -a seculens -C "node scripts/cleanup-orphans.mjs"
// Marks all running/queued scans as failed if updatedAt is older than 2 minutes
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cutoff = new Date(Date.now() - 2 * 60 * 1000);

const result = await prisma.scan.updateMany({
  where: {
    status: { in: ["running", "queued"] },
    updatedAt: { lt: cutoff },
  },
  data: {
    status: "failed",
    error: "サーバー再起動により中断（バッチクリーンアップ）",
    completedAt: new Date(),
  },
});

console.log(`Marked ${result.count} orphan scans as failed`);
await prisma.$disconnect();
