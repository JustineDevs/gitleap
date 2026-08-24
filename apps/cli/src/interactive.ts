import { Box, createCliRenderer, type KeyEvent, Text } from "@opentui/core";
import { fetchVerifiedArtifact, GitLeapClient, type ProcessingDetails } from "./client";
import { readSession, writeSession } from "./session";
import { COLOR, ICON, pipelineStages, sanitizeTerminalText, wrapIndex } from "./theme";

type Screen = "home" | "login" | "submit" | "status" | "pipeline" | "explorer" | "inject";
type Field = "email" | "password" | "url" | "revision" | "jobId" | "destination";
type UiNode = { content?: unknown; visible: boolean };
const TERMINAL_STATES = new Set(["ready", "failed", "cancelled", "expired"]);
const EXPLORER_TABS = ["Skills", "Schema Config", "Blueprint Engine", "System Diagnostics"];

export async function runInteractive(
  serverUrl: string,
  options?: { initialUrl?: string; initialRevision?: string; autoSubmit?: boolean },
): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: COLOR.bgCanvas,
    targetFps: 30,
  });
  const app = new InteractiveApp(
    renderer,
    new GitLeapClient({ serverUrl, sessionCookie: readSession() }),
    serverUrl,
  );
  app.mount();
  if (options?.autoSubmit && options.initialUrl) {
    void app.startPull(options.initialUrl, options.initialRevision ?? "HEAD");
  }
  await new Promise<void>((resolve) => (app.onExit = resolve));
}

export class InteractiveApp {
  private screen: Screen = "home";
  private menuIndex = 0;
  private field: Field = "email";
  private values: Record<Field, string> = {
    email: process.env.GITLEAP_EMAIL ?? "",
    password: process.env.GITLEAP_PASSWORD ?? "",
    url: "",
    revision: "",
    jobId: "",
    destination: ".",
  };
  private cursor: Record<Field, number> = {
    email: process.env.GITLEAP_EMAIL?.length ?? 0,
    password: process.env.GITLEAP_PASSWORD?.length ?? 0,
    url: 0,
    revision: 0,
    jobId: 0,
    destination: 1,
  };
  private message = "Choose an action.";
  private busy = false;
  private status:
    | { status: string; version: number; jobId: string; expiresAt: string | null }
    | undefined;
  private explorerTab = 0;
  private explorerIndex = 0;
  private previewOpen = true;
  private details: ProcessingDetails | undefined;
  private header!: UiNode;
  private footer!: UiNode;
  private views!: Record<Screen, UiNode>;
  private homeContent!: UiNode;
  private formContent!: UiNode;
  private submitContent!: UiNode;
  private injectContent!: UiNode;
  private statusContent!: UiNode;
  private pipelineTitle!: UiNode;
  private pipelineProgress!: UiNode;
  private pipelineHelp!: UiNode;
  private pipelineStages!: UiNode[];
  private explorerTabs!: UiNode;
  private explorerSkills!: UiNode;
  private explorerDetail!: UiNode;
  private explorerPreview!: UiNode;
  onExit: () => void = () => undefined;

  constructor(
    private readonly renderer: Awaited<ReturnType<typeof createCliRenderer>>,
    private readonly client: GitLeapClient,
    private readonly serverUrl: string,
  ) {}

  mount(): void {
    const root = Box(
      {
        id: "gitleap-root",
        flexDirection: "column",
        gap: 1,
        padding: 1,
        backgroundColor: COLOR.bgCanvas,
      },
      Box(
        { borderStyle: "rounded", borderColor: COLOR.primary, height: 3 },
        Text({ id: "gitleap-header", content: "", fg: COLOR.textNormal }),
      ),
      Box(
        {
          id: "gitleap-body",
          borderStyle: "rounded",
          borderColor: COLOR.accent,
          flexGrow: 1,
          flexDirection: "column",
          padding: 1,
        },
        Box(
          { id: "view-home", flexDirection: "column", flexGrow: 1 },
          Text({ id: "home-content", content: "", fg: COLOR.textNormal }),
        ),
        Box(
          { id: "view-login", flexDirection: "column", flexGrow: 1, visible: false },
          Text({ id: "form-content", content: "", fg: COLOR.textNormal }),
        ),
        Box(
          { id: "view-submit", flexDirection: "column", flexGrow: 1, visible: false },
          Text({ id: "submit-content", content: "", fg: COLOR.textNormal }),
        ),
        Box(
          { id: "view-status", flexDirection: "column", flexGrow: 1, visible: false },
          Text({ id: "status-content", content: "", fg: COLOR.textNormal }),
        ),
        Box(
          { id: "view-inject", flexDirection: "column", flexGrow: 1, visible: false },
          Text({ id: "inject-content", content: "", fg: COLOR.textNormal }),
        ),
        Box(
          { id: "view-pipeline", flexDirection: "column", flexGrow: 1, visible: false, gap: 1 },
          Text({ id: "pipeline-title", content: "", fg: COLOR.textNormal }),
          Text({ id: "pipeline-progress", content: "", fg: COLOR.accent }),
          Box(
            {
              id: "pipeline-grid",
              border: true,
              borderStyle: "rounded",
              borderColor: COLOR.border,
              flexDirection: "column",
              flexGrow: 1,
              paddingX: 1,
            },
            ...Array.from({ length: 5 }, (_, index) =>
              Text({ id: `pipeline-stage-text-${index}`, content: "", fg: COLOR.textNormal }),
            ),
          ),
          Text({ id: "pipeline-help", content: "", fg: COLOR.textMuted }),
        ),
        Box(
          { id: "view-explorer", flexDirection: "column", flexGrow: 1, visible: false, gap: 1 },
          Text({ id: "explorer-tabs", content: "", fg: COLOR.textNormal }),
          Box(
            {
              id: "explorer-grid",
              flexDirection: "row",
              flexWrap: "wrap",
              flexGrow: 1,
              gap: 1,
              alignItems: "stretch",
            },
            Box(
              {
                id: "explorer-skills-panel",
                border: true,
                borderStyle: "rounded",
                borderColor: COLOR.border,
                flexGrow: 1,
                flexBasis: 24,
                minWidth: 20,
                padding: 1,
              },
              Text({ id: "explorer-skills", content: "", fg: COLOR.textNormal }),
            ),
            Box(
              {
                id: "explorer-detail-panel",
                border: true,
                borderStyle: "rounded",
                borderColor: COLOR.border,
                flexGrow: 2,
                flexBasis: 32,
                minWidth: 24,
                padding: 1,
              },
              Text({ id: "explorer-detail", content: "", fg: COLOR.textNormal }),
            ),
          ),
          Box(
            {
              id: "explorer-preview-panel",
              border: true,
              borderStyle: "rounded",
              borderColor: COLOR.primary,
              height: 7,
              padding: 1,
            },
            Text({ id: "explorer-preview", content: "", fg: COLOR.textNormal }),
          ),
        ),
      ),
      Box(
        { borderStyle: "rounded", borderColor: COLOR.border, height: 3, paddingX: 1 },
        Text({ id: "gitleap-footer", content: "", fg: COLOR.textMuted }),
      ),
    );
    this.renderer.keyInput.on("keypress", (key) => this.handleKey(key));
    this.renderer.root.add(root);
    const find = (id: string) =>
      (
        this.renderer.root as unknown as { findDescendantById: (value: string) => unknown }
      ).findDescendantById(id) as UiNode;
    this.header = find("gitleap-header");
    this.footer = find("gitleap-footer");
    this.views = {
      home: find("view-home"),
      login: find("view-login"),
      submit: find("view-submit"),
      status: find("view-status"),
      pipeline: find("view-pipeline"),
      explorer: find("view-explorer"),
      inject: find("view-inject"),
    };
    this.homeContent = find("home-content");
    this.formContent = find("form-content");
    this.submitContent = find("submit-content");
    this.statusContent = find("status-content");
    this.injectContent = find("inject-content");
    this.pipelineTitle = find("pipeline-title");
    this.pipelineProgress = find("pipeline-progress");
    this.pipelineHelp = find("pipeline-help");
    this.pipelineStages = Array.from({ length: 5 }, (_, index) =>
      find(`pipeline-stage-text-${index}`),
    );
    this.explorerTabs = find("explorer-tabs");
    this.explorerSkills = find("explorer-skills");
    this.explorerDetail = find("explorer-detail");
    this.explorerPreview = find("explorer-preview");
    this.renderer.on("resize", () => this.render());
    this.render();
  }

  async startPull(url: string, revision: string): Promise<void> {
    this.values.url = url;
    this.values.revision = revision;
    this.screen = "submit";
    this.field = "url";
    this.render();
    await this.submitFieldForm();
  }

  private handleKey(key: KeyEvent): void {
    if (key.ctrl && key.name === "c") {
      this.exit();
      return;
    }
    if (this.busy) return;
    if (key.name === "escape" && this.screen !== "pipeline") {
      this.back();
      return;
    }
    if (this.screen === "home") {
      this.handleHome(key);
      return;
    }
    if (this.screen === "pipeline") {
      this.handlePipeline(key);
      return;
    }
    if (this.screen === "explorer") {
      this.handleExplorer(key);
      return;
    }
    if (key.name === "tab" || key.name === "down" || key.name === "up") {
      this.moveField(key.name === "up" ? -1 : 1);
      return;
    }
    if (key.name === "return") return void this.submitFieldForm();
    if (key.name === "left") {
      this.cursor[this.field] = Math.max(0, this.cursor[this.field] - 1);
      this.render();
      return;
    }
    if (key.name === "right") {
      this.cursor[this.field] = Math.min(
        this.values[this.field].length,
        this.cursor[this.field] + 1,
      );
      this.render();
      return;
    }
    if (key.name === "home") {
      this.cursor[this.field] = 0;
      this.render();
      return;
    }
    if (key.name === "end") {
      this.cursor[this.field] = this.values[this.field].length;
      this.render();
      return;
    }
    if (key.name === "backspace") {
      const cursor = this.cursor[this.field];
      if (cursor > 0) {
        this.values[this.field] =
          this.values[this.field].slice(0, cursor - 1) + this.values[this.field].slice(cursor);
        this.cursor[this.field] = cursor - 1;
      }
      this.render();
      return;
    }
    if (key.name === "delete") {
      const cursor = this.cursor[this.field];
      this.values[this.field] =
        this.values[this.field].slice(0, cursor) + this.values[this.field].slice(cursor + 1);
      this.render();
      return;
    }
    if (!key.ctrl && !key.meta && key.sequence && key.sequence.length === 1) {
      const cursor = this.cursor[this.field];
      this.values[this.field] =
        this.values[this.field].slice(0, cursor) +
        key.sequence +
        this.values[this.field].slice(cursor);
      this.cursor[this.field] = cursor + 1;
      this.render();
    }
  }

  private handleHome(key: KeyEvent): void {
    if (key.name === "up") this.menuIndex = wrapIndex(this.menuIndex - 1, 4);
    else if (key.name === "down") this.menuIndex = wrapIndex(this.menuIndex + 1, 4);
    else if (key.name === "return") {
      if (this.menuIndex === 0) this.screen = "login";
      if (this.menuIndex === 1) this.screen = "submit";
      if (this.menuIndex === 2) this.screen = "status";
      if (this.menuIndex === 3) {
        this.exit();
        return;
      }
      this.field = this.screen === "login" ? "email" : this.screen === "submit" ? "url" : "jobId";
    }
    this.render();
  }

  private moveField(direction: number): void {
    const fields: Field[] =
      this.screen === "login"
        ? ["email", "password"]
        : this.screen === "submit"
          ? ["url", "revision"]
          : this.screen === "inject"
            ? ["destination"]
            : ["jobId"];
    this.field =
      fields[wrapIndex(fields.indexOf(this.field) + direction, fields.length)] ?? fields[0];
    this.render();
  }

  private async submitFieldForm(): Promise<void> {
    this.busy = true;
    this.message = "Working...";
    this.render();
    try {
      if (this.screen === "login") {
        await this.client.signIn(this.values.email, this.values.password);
        if (this.client.cookie) writeSession(this.client.cookie);
        this.message = "Authenticated. Session saved.";
        this.screen = "home";
      } else if (this.screen === "submit") {
        const result = await this.client.submit({
          url: this.values.url,
          revision: this.values.revision,
        });
        this.status = { jobId: result.jobId, status: result.status, version: 0, expiresAt: null };
        this.values.jobId = result.jobId;
        this.message = result.reused ? "Existing job reused." : "Job submitted.";
        await this.refreshDetails(result.jobId);
        this.screen = result.status === "ready" ? "explorer" : "pipeline";
        void this.poll(result.jobId);
      } else if (this.screen === "inject") {
        await this.downloadArtifact(true, this.values.destination);
        this.screen = "explorer";
      } else {
        this.status = await this.client.status(this.values.jobId);
        await this.refreshDetails(this.status.jobId);
        this.message = "Status refreshed.";
        if (this.status.status === "ready") this.screen = "explorer";
        else {
          this.screen = "pipeline";
          void this.poll(this.status.jobId);
        }
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async poll(jobId: string): Promise<void> {
    while (this.screen === "pipeline" && this.status && !TERMINAL_STATES.has(this.status.status)) {
      await Bun.sleep(1_000);
      try {
        this.status = await this.client.status(jobId);
        await this.refreshDetails(jobId);
        this.message = `Updated ${new Date().toLocaleTimeString()}`;
        if (this.status.status === "ready") this.screen = "explorer";
        this.render();
      } catch (error) {
        this.message = error instanceof Error ? error.message : String(error);
        this.render();
        return;
      }
    }
  }

  private async refreshDetails(jobId: string): Promise<void> {
    this.details = await this.client.details(jobId);
    this.status = {
      jobId: this.details.jobId,
      status: this.details.status,
      version: this.details.version,
      expiresAt: this.details.expiresAt,
    };
  }

  private handlePipeline(key: KeyEvent): void {
    if (key.name === "escape" || key.name === "c") {
      void this.cancelPipeline();
      return;
    }
    if (key.name === "r") void this.submitFieldForm();
  }

  private async cancelPipeline(): Promise<void> {
    if (!this.status || TERMINAL_STATES.has(this.status.status)) {
      this.back();
      return;
    }
    this.busy = true;
    this.message = "Requesting cancellation...";
    this.render();
    try {
      const result = await this.client.cancel(this.status.jobId, this.status.version);
      if (!result.accepted) throw new Error("Cancellation was not accepted");
      await this.refreshDetails(this.status.jobId);
      this.message =
        this.status && TERMINAL_STATES.has(this.status.status)
          ? "Cancellation complete."
          : "Cancellation requested; waiting for the worker...";
      if (this.status && !TERMINAL_STATES.has(this.status.status))
        void this.poll(this.status.jobId);
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private handleExplorer(key: KeyEvent): void {
    if (key.name === "q") {
      this.exit();
      return;
    }
    if (key.name === "escape") {
      this.back();
      return;
    }
    if (key.name === "d") {
      void this.downloadArtifact(false);
      return;
    }
    if (key.name === "i") {
      this.screen = "inject";
      this.field = "destination";
      this.render();
      return;
    }
    if (key.name === "c") {
      this.previewOpen = !this.previewOpen;
      this.render();
      return;
    }
    if (key.name === "tab" || key.name === "right" || key.name === "l") {
      this.explorerTab = wrapIndex(this.explorerTab + 1, EXPLORER_TABS.length);
    } else if (key.name === "left" || key.name === "h") {
      this.explorerTab = wrapIndex(this.explorerTab - 1, EXPLORER_TABS.length);
    } else if (key.name === "down" || key.name === "j") {
      this.explorerIndex = wrapIndex(this.explorerIndex + 1, this.details?.skills.length ?? 1);
    } else if (key.name === "up" || key.name === "k") {
      this.explorerIndex = wrapIndex(this.explorerIndex - 1, this.details?.skills.length ?? 1);
    }
    this.render();
  }

  private async downloadArtifact(inject: boolean, destination = "."): Promise<void> {
    if (!this.status) return;
    this.busy = true;
    this.message = "Preparing authorized download...";
    this.render();
    try {
      const artifact = await this.client.download(this.status.jobId);
      const output = `gitleap-${this.status.jobId}.tar.gz`;
      const body = await fetchVerifiedArtifact(artifact);
      await Bun.write(output, body);
      if (inject) {
        const listingProcess = Bun.spawn(["tar", "-tzf", output], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const listing = await new Response(listingProcess.stdout).text();
        if ((await listingProcess.exited) !== 0) throw new Error("Artifact archive is invalid");
        const paths = listing.split("\n").filter(Boolean);
        if (paths.some((path) => path.startsWith("/") || path.split("/").includes("..")))
          throw new Error("Artifact contains an unsafe path");
        const metadataProcess = Bun.spawn(["tar", "-tvzf", output], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const metadata = await new Response(metadataProcess.stdout).text();
        if ((await metadataProcess.exited) !== 0) throw new Error("Artifact archive is invalid");
        if (metadata.split("\n").some((line) => line.length > 0 && !/^[-d]/.test(line)))
          throw new Error("Artifact contains an unsupported entry type");
        const destinationCheck = Bun.spawn(["test", "-d", destination], {
          stdout: "pipe",
          stderr: "pipe",
        });
        if ((await destinationCheck.exited) !== 0)
          throw new Error(`Injection directory does not exist: ${destination}`);
        const extracted = Bun.spawn(
          [
            "tar",
            "--no-same-owner",
            "--no-same-permissions",
            "--keep-directory-symlink",
            "--keep-old-files",
            "-xzf",
            output,
            "-C",
            destination,
          ],
          {
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        if ((await extracted.exited) !== 0)
          throw new Error("Artifact extraction failed; existing files were not overwritten");
        this.message = `Injected ${paths.length} files into ${destination}.`;
      } else {
        this.message = `Downloaded ${output} (${artifact.checksum.slice(0, 12)}…)`;
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private back(): void {
    if (this.screen === "home") {
      this.exit();
      return;
    }
    if (this.screen === "inject") {
      this.screen = "explorer";
      this.message = "Choose an explorer action.";
      this.render();
      return;
    }
    this.screen = "home";
    this.message = "Choose an action.";
    this.render();
  }

  private exit(): void {
    this.renderer.destroy();
    this.onExit();
  }

  private render(): void {
    this.header.content = ` GitLeap  ${ICON.prompt}  ${sanitizeTerminalText(this.serverUrl)}`;
    for (const [screen, view] of Object.entries(this.views)) {
      view.visible = screen === this.screen;
    }
    this.renderLayout();
    this.footer.content = ` ${this.message}   |   Enter select/submit   Tab or ↑↓ move   Esc back   Ctrl+C quit`;
    this.renderer.requestRender();
  }

  private renderLayout(): void {
    const items = ["Authenticate", "Submit repository", "Inspect job status", "Quit"];
    this.homeContent.content = [
      "",
      "GitLeap processing console",
      "",
      ...items.map((item, index) => `${index === this.menuIndex ? ICON.prompt : " "} ${item}`),
      "",
      "The CLI is the first product surface for the MVP.",
    ].join("\n");

    const fields: Field[] =
      this.screen === "login"
        ? ["email", "password"]
        : this.screen === "submit"
          ? ["url", "revision"]
          : ["destination"];
    const formContent = [
      "",
      this.screen === "login"
        ? "Authenticate"
        : this.screen === "submit"
          ? "Submit repository"
          : "Inject artifact",
      "",
      ...fields.map((field) => this.fieldLine(field)),
      "",
      this.screen === "inject"
        ? "Enter an existing directory. The archive is checked before extraction."
        : "Use a pinned immutable commit SHA.",
    ].join("\n");
    this.formContent.content = formContent;
    this.submitContent.content = formContent;
    this.injectContent.content = formContent;

    const status = this.status;
    this.statusContent.content = [
      "",
      "Job status",
      "",
      `Job: ${this.values.jobId || "(enter a job id)"}`,
      `State: ${status?.status ?? "not loaded"}`,
      `Version: ${status?.version ?? "-"}`,
      "",
      this.fieldLine("jobId"),
    ].join("\n");

    const pipelineStatus = this.status ?? { status: "queued", version: 0 };
    const pipeline = this.details
      ? {
          progress: this.details.progress.percent,
          label: this.details.status,
          stages: this.details.progress.stages.map((stage) => ({
            name: stage.name,
            detail: stage.errorCode ?? stage.status,
            state:
              stage.status === "succeeded"
                ? ("done" as const)
                : stage.status.includes("failed")
                  ? ("failed" as const)
                  : stage.status === "processing"
                    ? ("busy" as const)
                    : ("wait" as const),
          })),
        }
      : pipelineStages(pipelineStatus.status, pipelineStatus.version);
    this.pipelineTitle.content = `🧭 GitLeap Pipeline: ${this.values.url || "repository"}`;
    const filled = Math.round(pipeline.progress / 5);
    this.pipelineProgress.content = `[${"█".repeat(filled)}${"░".repeat(20 - filled)}] ${pipeline.progress}% ${pipeline.label}`;
    this.pipelineStages.forEach((node, index) => {
      const stage = pipeline.stages[index];
      node.visible = Boolean(stage);
      if (!stage) return;
      const icon =
        stage.state === "done"
          ? "✓"
          : stage.state === "busy"
            ? ICON.spinner[0]
            : stage.state === "failed"
              ? "✗"
              : "·";
      node.content = `${icon} [${stage.state.toUpperCase()}] ${pipelineStageLabel(stage.name, stage.detail)}`;
    });
    this.pipelineHelp.content =
      pipelineStatus.status === "ready"
        ? "Compilation complete. Opening Skills Explorer…"
        : "Press Esc or c to cancel the background worker.";

    const skills = this.details?.skills ?? [];
    const selected = skills[this.explorerIndex] ?? skills[0];
    const skill = sanitizeTerminalText(selected?.id ?? "(no skill)");
    const description = sanitizeTerminalText(
      selected?.description ?? "No generated skill metadata is available yet.",
    );
    const repo = this.details
      ? `${this.details.source.owner}/${this.details.source.repository}`
      : this.values.url.replace(/^https?:\/\//, "").replace(/\/$/, "") || "repository";
    const detail =
      this.explorerTab === 0
        ? [
            "⚙ Object Model: skill-manifest.json",
            `  ├─ Capability: ${sanitizeTerminalText(selected?.name ?? skill)}`,
            `  ├─ Description: ${description}`,
            `  ╰─ Evidence: ${selected?.evidence.length ?? 0} source references`,
          ]
        : this.explorerTab === 1
          ? [
              "⚙ Schema Config",
              `  format: skills-manifest.json v${this.details?.manifest.version ?? 1}`,
              `  skills: ${this.details?.manifest.skills.length ?? 0}`,
              `  parser: ${this.details?.architectureMap.parser ?? "unknown"}`,
            ]
          : this.explorerTab === 2
            ? [
                "⚙ Blueprint Engine",
                `  files indexed: ${this.details?.preview.files.length ?? 0}`,
                `  dependency edges: ${this.details?.preview.edges.length ?? 0}`,
                `  artifact: ${this.status?.status === "ready" ? "ready" : "pending"}`,
              ]
            : [
                "⚙ System Diagnostics",
                `  job: ${this.values.jobId}`,
                `  state: ${this.status?.status ?? "ready"}`,
                `  version: ${this.status?.version ?? 0}`,
                `  commit: ${sanitizeTerminalText(this.details?.source.commitSha ?? "unknown")}`,
              ];
    this.explorerTabs.content = [
      ` GitLeap Explorer ── ${repo} ── (q: exit / d: download)`,
      EXPLORER_TABS.map((tab, index) =>
        index === this.explorerTab ? `[ ${tab} ]` : `  ${tab}  `,
      ).join(""),
    ].join("\n");
    this.explorerSkills.content = [
      "Skills List (4 cols)",
      "",
      ...(skills.length
        ? skills.map(
            ({ id: name }, index) =>
              `${index === this.explorerIndex ? ICON.prompt : " "} 🔹 ${sanitizeTerminalText(name)}`,
          )
        : ["No generated skills available."]),
    ].join("\n");
    const metrics = [
      "System Metrics:",
      `${metricBar(this.details?.progress.percent ?? 0)} ${this.details?.progress.percent ?? 0}%`,
      `Indexed files: ${this.details?.architectureMap.files.length ?? 0}  |  Edges: ${this.details?.architectureMap.edges.length ?? 0}`,
    ];
    this.explorerDetail.content = ["Schema Detail (8 cols)", "", ...detail, "", ...metrics].join(
      "\n",
    );
    const instructions = selected?.instructions ?? description;
    const previewLines = instructions.split("\n").slice(0, 4);
    this.explorerPreview.content = [
      `Code Blueprint Preview  ${skill}/SKILL.md`,
      ...previewLines.map(
        (line, index) => `${String(index + 1).padStart(2, " ")} │ ${sanitizeTerminalText(line)}`,
      ),
      `Evidence: ${sanitizeTerminalText(selected?.evidence[0]?.path ?? "none")}`,
      "[d] Download  [i] Inject  ↑↓/j/k Nav  h/l Tabs  c Preview",
    ].join("\n");
    this.explorerPreview.visible = this.previewOpen;
    const previewPanel = this.renderer.root.findDescendantById("explorer-preview-panel") as UiNode;
    previewPanel.visible = this.previewOpen;
  }

  private fieldLine(field: Field): string {
    const raw = this.values[field];
    const cursor = this.cursor[field];
    const masked = field === "password" ? "*".repeat(raw.length) : sanitizeTerminalText(raw);
    const value =
      this.field === field ? `${masked.slice(0, cursor)}▌${masked.slice(cursor)}` : masked;
    const label = field[0].toUpperCase() + field.slice(1);
    return `${this.field === field ? ICON.prompt : " "} ${label}: ${value}`;
  }
}

function pipelineStageLabel(name: string, detail: string): string {
  const labels: Record<string, string> = {
    ingest: "Ingested repository source stream.",
    architecture: "Built deterministic architecture map and evidence slices.",
    skills: "Map-Reduce AI processing and bounded skill synthesis.",
    compile: "Synthesizing skills-manifest.json configuration.",
    delivery: "Stored private ready pack.",
  };
  return `${labels[name] ?? name}: ${detail}`;
}

function metricBar(percent: number): string {
  const total = 24;
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * total);
  return `${"█".repeat(filled)}${"░".repeat(total - filled)}`;
}
