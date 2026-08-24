export const OSS_SKILL_REPOSITORIES = {
  "stop-slop": "https://github.com/hardikpandya/stop-slop.git",
  "humanizer-zh": "https://github.com/op7418/Humanizer-zh.git",
} as const;

export type SkillIntegration = keyof typeof OSS_SKILL_REPOSITORIES;

export type CommandResult = {
  command: readonly string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RepomixOptions = {
  cwd: string;
  output?: string;
  style?: "xml" | "markdown" | "plain" | "json";
  compress?: boolean;
  ignore?: readonly string[];
};

export type SkillPromptOptions = {
  skillDirectory: string;
  input: string;
};
