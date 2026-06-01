/**
 * Senior Engineer Context Pack Extension
 *
 * Commands:
 * - /context_index
 * - /context_show
 * - /context_focus <keyword>
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const CONTEXT_ROOT = path.join(os.homedir(), ".pi", "agent", "context-packs", "senior-engineer-workflow", "projects");
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", "vendor", "__pycache__"]);
const INTERESTING_FILES = [
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "composer.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Dockerfile",
  "docker-compose.yml",
  "compose.yml",
  ".env.example",
  "next.config.js",
  "next.config.ts",
  "tailwind.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "vite.config.ts",
  "adonisrc.ts",
  "artisan",
];

function slugifyProjectPath(projectPath: string): string {
  return projectPath
    .replace(os.homedir(), "home")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function contextFile(projectPath = process.cwd()): Promise<string> {
  await fs.mkdir(CONTEXT_ROOT, { recursive: true });
  return path.join(CONTEXT_ROOT, `${slugifyProjectPath(projectPath)}.md`);
}

async function safeRead(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return "";
  }
}

async function walk(dir: string, depth = 0, maxDepth = 4): Promise<string[]> {
  if (depth > maxDepth) return [];
  const out: string[] = [];

  let entries: Array<import("node:fs").Dirent> = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(`${full}/`);
      out.push(...(await walk(full, depth + 1, maxDepth)));
    } else {
      out.push(full);
    }
  }

  return out;
}

function rel(projectPath: string, file: string): string {
  return path.relative(projectPath, file) || ".";
}

function detectStack(files: string[], packageJson: string): string[] {
  const stack = new Set<string>();
  const fileNames = files.map((f) => path.basename(f));
  const all = files.join("\n").toLowerCase();
  const pkg = packageJson.toLowerCase();

  if (pkg.includes("next")) stack.add("Next.js");
  if (pkg.includes("react")) stack.add("React");
  if (pkg.includes("@adonisjs")) stack.add("AdonisJS");
  if (pkg.includes("express")) stack.add("Express");
  if (pkg.includes("fastapi") || fileNames.includes("requirements.txt")) stack.add("Python / possible FastAPI");
  if (fileNames.includes("composer.json")) stack.add("PHP / Composer");
  if (fileNames.includes("go.mod")) stack.add("Go");
  if (fileNames.includes("Dockerfile") || all.includes("docker-compose")) stack.add("Docker");
  if (pkg.includes("tailwind")) stack.add("Tailwind CSS");
  if (pkg.includes("shadcn") || all.includes("components/ui")) stack.add("shadcn/ui");
  if (pkg.includes("prisma")) stack.add("Prisma");
  if (pkg.includes("drizzle")) stack.add("Drizzle");

  return Array.from(stack);
}

async function buildContextPack(projectPath = process.cwd()): Promise<{ file: string; content: string }> {
  const files = await walk(projectPath);
  const relativeFiles = files.map((f) => rel(projectPath, f));
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = await safeRead(packageJsonPath);
  const stack = detectStack(files, packageJson);

  const interesting: string[] = [];
  for (const name of INTERESTING_FILES) {
    const p = path.join(projectPath, name);
    try {
      const stat = await fs.stat(p);
      if (stat.isFile()) interesting.push(name);
    } catch {}
  }

  const routeHints = relativeFiles.filter((f) =>
    /(^app\/|^pages\/|routes|router|controller|controllers|api|middleware|migration|schema|model|models)/i.test(f)
  );

  const componentHints = relativeFiles.filter((f) => /(component|components|ui|app\/.*page\.|app\/.*layout\.)/i.test(f));

  const testHints = relativeFiles.filter((f) => /(test|spec|__tests__|playwright|vitest|jest|pytest)/i.test(f));

  const content = [
    "# Senior Engineer Context Pack",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Project: ${projectPath}`,
    "",
    "## Detected Stack",
    "",
    ...(stack.length ? stack.map((s) => `- ${s}`) : ["- Unknown"]),
    "",
    "## Important Config Files",
    "",
    ...(interesting.length ? interesting.map((f) => `- ${f}`) : ["- None detected"]),
    "",
    "## Route / Backend / Database Hints",
    "",
    ...(routeHints.length ? routeHints.slice(0, 200).map((f) => `- ${f}`) : ["- None detected"]),
    "",
    "## Component / UI Hints",
    "",
    ...(componentHints.length ? componentHints.slice(0, 200).map((f) => `- ${f}`) : ["- None detected"]),
    "",
    "## Test Hints",
    "",
    ...(testHints.length ? testHints.slice(0, 100).map((f) => `- ${f}`) : ["- None detected"]),
    "",
    "## Project Tree Snapshot",
    "",
    ...relativeFiles.slice(0, 500).map((f) => `- ${f}`),
    "",
  ].join("\n");

  const file = await contextFile(projectPath);
  await fs.writeFile(file, content, "utf-8");
  return { file, content };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context_index", {
    description: "Generate Senior Engineer context pack for the current project",
    handler: async (_args, ctx) => {
      const { file, content } = await buildContextPack();
      ctx.ui.notify("Context pack generated", "info");
      pi.sendMessage({
        customType: "senior-engineer-context-pack",
        display: true,
        content: ["# Context Pack Generated", "", `File: ${file}`, "", content].join("\n"),
      });
    },
  });

  pi.registerCommand("context_show", {
    description: "Show current Senior Engineer context pack",
    handler: async (_args, ctx) => {
      const file = await contextFile();
      const content = await safeRead(file);
      if (!content) {
        ctx.ui.notify("Context pack belum ada. Jalankan /context_index dulu.", "warning");
        return;
      }
      pi.sendMessage({ customType: "senior-engineer-context-pack", display: true, content });
    },
  });

  pi.registerCommand("context_focus", {
    description: "Search current project files by keyword. Usage: /context:focus auth",
    handler: async (args, ctx) => {
      const keyword = (args || "").trim().toLowerCase();
      if (!keyword) {
        ctx.ui.notify("Isi keyword. Contoh: /context_focus auth", "warning");
        return;
      }
      const files = await walk(process.cwd(), 0, 5);
      const matches = files
        .map((f) => rel(process.cwd(), f))
        .filter((f) => f.toLowerCase().includes(keyword))
        .slice(0, 200);

      pi.sendMessage({
        customType: "senior-engineer-context-focus",
        display: true,
        content: [
          `# Focus Files: ${keyword}`,
          "",
          ...(matches.length ? matches.map((f) => `- ${f}`) : ["No matching files found."]),
        ].join("\n"),
      });
    },
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    const file = await contextFile();
    const content = await safeRead(file);
    if (!content) return {};

    const preview = content.length > 5000 ? `${content.slice(0, 5000)}\n\n[Context pack truncated]` : content;
    return {
      systemPrompt:
        event.systemPrompt +
        ["", "---", "SENIOR ENGINEER CONTEXT PACK", `File: ${file}`, preview, "---"].join("\n"),
    };
  });
}
