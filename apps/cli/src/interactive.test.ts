import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { GitLeapClient } from "./client";
import { InteractiveApp } from "./interactive";

const activeSetups: Array<Awaited<ReturnType<typeof createTestRenderer>>> = [];

afterEach(() => {
  for (const setup of activeSetups.splice(0)) setup.renderer.destroy();
});

describe("interactive layout", () => {
  test("builds real pipeline and explorer panel grids", async () => {
    const setup = await createTestRenderer({ width: 100, height: 30 });
    activeSetups.push(setup);
    const app = new InteractiveApp(
      setup.renderer,
      new GitLeapClient({ serverUrl: "http://localhost:3000" }),
      "http://localhost:3000",
    );
    app.mount();
    await setup.renderOnce();

    const root = setup.renderer.root;
    const pipelineGrid = root.findDescendantById("pipeline-grid");
    const explorerGrid = root.findDescendantById("explorer-grid");
    expect(pipelineGrid?.getChildrenCount()).toBe(5);
    expect(explorerGrid?.getChildrenCount()).toBe(2);
    expect(root.findDescendantById("gitleap-body")?.getChildrenCount()).toBe(7);
    expect(root.findDescendantById("pipeline-stage-0")).toBeUndefined();
  });

  test("wraps explorer columns after a terminal resize", async () => {
    const setup = await createTestRenderer({ width: 100, height: 30 });
    activeSetups.push(setup);
    const app = new InteractiveApp(
      setup.renderer,
      new GitLeapClient({ serverUrl: "http://localhost:3000" }),
      "http://localhost:3000",
    );
    app.mount();
    const state = app as unknown as { screen: string; render: () => void };
    state.screen = "explorer";
    state.render();
    await setup.renderOnce();
    const desktopSkills = setup.renderer.root.findDescendantById("explorer-skills-panel");
    const desktopDetail = setup.renderer.root.findDescendantById("explorer-detail-panel");
    const desktopPreview = setup.renderer.root.findDescendantById("explorer-preview-panel");
    expect(desktopDetail?.width).toBeGreaterThan(desktopSkills?.width ?? 0);
    expect(desktopPreview?.width).toBeGreaterThan(desktopDetail?.width ?? 0);

    setup.resize(36, 30);
    await setup.renderOnce();
    const skills = setup.renderer.root.findDescendantById("explorer-skills-panel");
    const detail = setup.renderer.root.findDescendantById("explorer-detail-panel");
    const preview = setup.renderer.root.findDescendantById("explorer-preview-panel");
    expect(skills?.width).toBeGreaterThan(0);
    expect(detail?.width).toBeGreaterThan(0);
    expect(detail?.y).toBeGreaterThan(skills?.y ?? -1);
    expect(preview?.width).toBeGreaterThan(0);
  });

  test("renders the landing page as the Step A route", async () => {
    const setup = await createTestRenderer({ width: 100, height: 30 });
    activeSetups.push(setup);
    const app = new InteractiveApp(
      setup.renderer,
      new GitLeapClient({ serverUrl: "http://localhost:3000" }),
      "http://localhost:3000",
    );
    app.mount();
    await setup.renderOnce();

    expect(setup.renderer.root.findDescendantById("view-home")?.visible).toBe(true);
    expect(setup.renderer.root.findDescendantById("view-submit")?.visible).toBe(false);
  });

  test("uses authoritative state after requesting pipeline cancellation", async () => {
    const setup = await createTestRenderer({ width: 100, height: 30 });
    activeSetups.push(setup);
    const client = new GitLeapClient({ serverUrl: "http://localhost:3000" });
    client.cancel = async () => ({ accepted: true });
    const app = new InteractiveApp(setup.renderer, client, "http://localhost:3000");
    app.mount();
    const state = app as unknown as {
      screen: string;
      status: { jobId: string; status: string; version: number; expiresAt: string | null };
      render: () => void;
    };
    state.screen = "pipeline";
    state.status = { jobId: "job-1", status: "running", version: 4, expiresAt: null };
    const refreshState = app as unknown as {
      refreshDetails: (jobId: string) => Promise<void>;
    };
    refreshState.refreshDetails = async () => {
      state.status = { jobId: "job-1", status: "cancelled", version: 9, expiresAt: null };
    };
    state.render();
    await setup.renderOnce();

    setup.mockInput.pressKey("c");
    await setup.waitFor(() => state.status.status === "cancelled");
    expect(state.status.version).toBe(9);
  });
});
