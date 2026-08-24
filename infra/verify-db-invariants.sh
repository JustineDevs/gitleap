#!/usr/bin/env sh
set -eu

container="${GITLEAP_POSTGRES_CONTAINER:-infra-postgres-1}"
docker exec "$container" psql -v ON_ERROR_STOP=1 -U gitleap -d gitleap <<'SQL'
DO $$
DECLARE
  source_id text := 'adr-invariant-source';
BEGIN
  INSERT INTO "SourceIdentity" (id, provider, owner, repository, "commitSha", "pipelineVersion", "configurationHash")
  VALUES (source_id, 'github', 'owner', 'repo', repeat('a', 40), 'v1', 'invariant');
  INSERT INTO "ProcessingJob" (id, "sourceIdentityId", "updatedAt")
  VALUES ('adr-invariant-job-1', source_id, CURRENT_TIMESTAMP);
  BEGIN
    INSERT INTO "ProcessingJob" (id, "sourceIdentityId", "updatedAt")
    VALUES ('adr-invariant-job-2', source_id, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'active source uniqueness invariant failed';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  DELETE FROM "ProcessingJob" WHERE id = 'adr-invariant-job-1';
  DELETE FROM "SourceIdentity" WHERE id = source_id;
END $$;
SQL
