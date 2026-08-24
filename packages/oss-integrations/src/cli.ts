#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildSkillPrompt, installSkill, runRepomix, type SkillIntegration } from "./index";

const args = Bun.argv.slice(2);
const command = args[0];

try {
  if (command === "repomix") {
    const cwd = value("--cwd") ?? process.cwd();
    const result = await runRepomix({
      cwd,
      output: value("--output"),
      style: value("--style") as "xml" | "markdown" | "plain" | "json" | undefined,
      compress: args.includes("--compress"),
    });
    process.stdout.write(result.stdout);
  } else if (command === "install") {
    const skill = skillName(required(1));
    const target = value("--dir") ?? resolve(".agents", "skills", skill);
    const result = await installSkill(skill, target);
    process.stdout.write(result.stdout || `Installed ${skill} at ${target}\n`);
  } else if (command === "prompt") {
    const skill = skillName(required(1));
    const inputPath = requiredValue("--input");
    const skillDirectory = value("--skill-dir") ?? resolve(".agents", "skills", skill);
    const prompt = await buildSkillPrompt({
      skillDirectory,
      input: await readFile(inputPath, "utf8"),
    });
    const output = value("--output");
    if (output) await Bun.write(output, prompt);
    else process.stdout.write(`${prompt}\n`);
  } else {
    throw new Error(
      "Usage: oss repomix [--cwd DIR] [--output FILE] [--style FORMAT] [--compress] | oss install <stop-slop|humanizer-zh> [--dir DIR] | oss prompt <stop-slop|humanizer-zh> --input FILE [--output FILE]",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function value(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(index: number): string {
  const argument = args[index];
  if (!argument || argument.startsWith("--")) throw new Error("Missing required argument");
  return argument;
}

function requiredValue(flag: string): string {
  const result = value(flag);
  if (!result) throw new Error(`Missing ${flag}`);
  return result;
}

function skillName(value: string): SkillIntegration {
  if (value !== "stop-slop" && value !== "humanizer-zh")
    throw new Error(`Unsupported writing skill: ${value}`);
  return value;
}
