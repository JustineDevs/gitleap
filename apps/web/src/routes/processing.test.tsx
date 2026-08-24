// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import Processing, { processingPollInterval } from "./processing";

const state = vi.hoisted(() => ({ status: "ready" as string, fail: false }));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useParams: () => ({ jobId: "job-1" }) };
});

vi.mock("@/utils/trpc", () => ({
  trpc: {
    getProcessingStatus: {
      queryOptions: () => ({
        queryKey: ["status"],
        queryFn: async () => {
          if (state.fail) throw new Error("network unavailable");
          return { jobId: "job-1", status: state.status, version: 2, expiresAt: null };
        },
      }),
    },
    getArtifactDownload: {
      queryOptions: () => ({
        queryKey: ["artifact"],
        queryFn: async () => ({
          url: "https://storage.example/signed",
          checksum: "checksum",
          expiresAt: new Date().toISOString(),
        }),
      }),
    },
    cancelProcessing: {
      mutationOptions: () => ({ mutationFn: async () => ({ accepted: true }) }),
    },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Processing />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("web processing states", () => {
  it("uses bounded exponential polling and stops at terminal states", () => {
    expect(processingPollInterval("queued", 0)).toBe(1_000);
    expect(processingPollInterval("running", 2)).toBe(4_000);
    expect(processingPollInterval("running", 99)).toBe(10_000);
    expect(processingPollInterval("ready", 0)).toBe(false);
    expect(processingPollInterval("running", 0, 4)).toBe(10_000);
  });

  it("shows a ready artifact link", async () => {
    state.status = "ready";
    state.fail = false;
    renderPage();
    expect(await screen.findByRole("link", { name: "Download skill pack" })).toBeTruthy();
  });

  it("shows a recoverable status error", async () => {
    state.status = "error";
    state.fail = true;
    renderPage();
    expect(await screen.findByText("Unable to load this processing job.")).toBeTruthy();
  });
});
