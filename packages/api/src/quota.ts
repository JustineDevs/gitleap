import { randomUUID } from "node:crypto";
import prisma, { Prisma } from "@gitleap/db";

type QueryClient = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
};

export async function reserveSubmissionQuota(
  userId: string,
  now = new Date(),
  limit = 10,
  client: QueryClient = prisma,
): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const rows = await client.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "SubmissionQuota" ("id", "userId", "windowStart", "count")
    VALUES (${randomUUID()}, ${userId}, ${windowStart}, 1)
    ON CONFLICT ("userId", "windowStart") DO UPDATE
    SET "count" = "SubmissionQuota"."count" + 1
    WHERE "SubmissionQuota"."count" < ${limit}
    RETURNING "count"
  `);
  return rows.length === 1;
}
