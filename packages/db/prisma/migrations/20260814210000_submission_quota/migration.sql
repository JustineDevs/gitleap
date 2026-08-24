CREATE TABLE "SubmissionQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubmissionQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmissionQuota_userId_windowStart_key"
  ON "SubmissionQuota"("userId", "windowStart");
CREATE INDEX "SubmissionQuota_windowStart_idx"
  ON "SubmissionQuota"("windowStart");
ALTER TABLE "SubmissionQuota"
  ADD CONSTRAINT "SubmissionQuota_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
