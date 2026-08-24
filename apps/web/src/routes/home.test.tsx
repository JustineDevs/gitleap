// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "./home";

vi.mock("@/utils/trpc", () => ({
  trpc: {
    healthCheck: {
      queryOptions: () => ({ queryKey: ["health"], queryFn: async () => true }),
    },
  },
}));

describe("web processing flow", () => {
  it("renders the real health state from the API query", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "API Status" })).toBeTruthy();
    expect(await screen.findByText("Connected")).toBeTruthy();
  });
});
