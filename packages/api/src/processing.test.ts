import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    STRIPE_SECRET_KEY: "test-stripe",
    STRIPE_WEBHOOK_SECRET: "test-webhook",
    ARCJET_KEY: "test-arcjet",
    CORS_ORIGIN: "http://localhost:3000",
  });
});

import { projectProcessingDetails } from "./processing";

describe("processing details projection", () => {
  it("projects pipeline, repository, skills, and architecture data without source content", () => {
    const details = projectProcessingDetails({
      id: "job-1",
      state: "READY",
      stateVersion: 4,
      updatedAt: new Date("2026-08-14T00:00:00Z"),
      expiresAt: null,
      sourceIdentity: {
        provider: "github",
        owner: "acme",
        repository: "repo",
        commitSha: "a".repeat(40),
        pipelineVersion: "v1",
        configurationHash: "cfg",
      },
      stages: [
        {
          name: "queue",
          state: "SUCCEEDED",
          output: null,
          startedAt: null,
          finishedAt: new Date("2026-08-14T00:00:01Z"),
          errorCode: null,
        },
        {
          name: "index",
          state: "SUCCEEDED",
          output: {
            version: 1,
            parser: "v1-lexical",
            files: [{ path: "src/index.ts", language: "typescript" }],
            edges: [{ from: "src/index.ts", to: "./dep" }],
          },
          startedAt: null,
          finishedAt: null,
          errorCode: null,
        },
        {
          name: "synthesis",
          state: "SUCCEEDED",
          output: {
            schemaVersion: 1,
            id: "repo-overview",
            name: "Repository Overview",
            description: "A bounded overview",
            instructions: "do not expose this preview field",
            triggers: ["when needed"],
            inputs: ["source"],
            outputs: ["guidance"],
            prerequisites: ["repository"],
            limitations: ["bounded"],
            validation: ["check evidence"],
            evidence: [{ path: "src/index.ts", reason: "entry point" }],
          },
          startedAt: null,
          finishedAt: null,
          errorCode: null,
        },
        {
          name: "compile",
          state: "SUCCEEDED",
          output: { manifest: { version: 1, skills: [{ id: "repo-overview" }] } },
          startedAt: null,
          finishedAt: null,
          errorCode: null,
        },
        {
          name: "delivery",
          state: "SUCCEEDED",
          output: null,
          startedAt: null,
          finishedAt: null,
          errorCode: null,
        },
      ],
    });

    expect(details.status).toBe("ready");
    expect(details.progress).toMatchObject({ percent: 100, completed: 5, total: 5 });
    expect(details.source.repository).toBe("repo");
    expect(details.manifest).toEqual({ version: 1, skills: [{ id: "repo-overview" }] });
    expect(details.architectureMap.edges).toEqual([{ from: "src/index.ts", to: "./dep" }]);
    expect(details.skills[0]).toMatchObject({
      id: "repo-overview",
      evidence: [{ path: "src/index.ts", reason: "entry point" }],
    });
    expect(JSON.stringify(details)).not.toContain("do not expose this preview field");
  });

  it("keeps incomplete jobs pending while exposing only safe failure codes", () => {
    const details = projectProcessingDetails({
      id: "job-2",
      state: "PROCESSING",
      stateVersion: 1,
      updatedAt: new Date(),
      expiresAt: null,
      sourceIdentity: {
        provider: "github",
        owner: "acme",
        repository: "repo",
        commitSha: "b".repeat(40),
        pipelineVersion: "v1",
        configurationHash: "cfg",
      },
      stages: [
        {
          name: "pipeline",
          state: "FAILED_RETRYABLE",
          output: null,
          startedAt: null,
          finishedAt: null,
          errorCode: "UPSTREAM_FAILURE",
        },
      ],
    });

    expect(details.status).toBe("running");
    expect(details.progress.percent).toBe(0);
    expect(details.progress.stages.map((stage) => stage.status)).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(details.progress.stages.find((stage) => stage.name === "ingest")?.errorCode).toBeNull();
  });
});
