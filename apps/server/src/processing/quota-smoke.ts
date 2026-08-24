import "dotenv/config";

import { reserveSubmissionQuota } from "@gitleap/api/quota";
import prisma from "@gitleap/db";

const user = await prisma.user.create({
  data: {
    id: `quota-smoke-${crypto.randomUUID()}`,
    name: "Quota Smoke",
    email: `quota-${crypto.randomUUID()}@example.test`,
  },
});
try {
  const results = [];
  for (let attempt = 0; attempt < 11; attempt++)
    results.push(await reserveSubmissionQuota(user.id, new Date("2026-08-14T12:00:00.000Z")));
  if (results.filter(Boolean).length !== 10 || results[10] !== false)
    throw new Error(`Unexpected quota result: ${JSON.stringify(results)}`);
  console.log(JSON.stringify({ allowed: results.filter(Boolean).length, rejected: !results[10] }));
} finally {
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}
