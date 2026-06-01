/**
 * Senior Engineer Project Memory Extension
 *
 * Commands:
 * - /memory_show
 * - /memory_update <note>
 * - /memory_path
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const MEMORY_ROOT = path.join(os.homedir(), ".pi", "agent", "memories", "senior-engineer-workflow", "projects");

function slugifyProjectPath(projectPath: string): string {
  return projectPath
    .replace(os.homedir(), "home")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function getMemoryFile(projectPath = process.cwd()): Promise<string> {
  await fs.mkdir(MEMORY_ROOT, { recursive: true });
  const memoryFile = path.join(MEMORY_ROOT, `${slugifyProjectPath(projectPath)}.md`);

  try {
    await fs.access(memoryFile);
  } catch {
    await fs.writeFile(
      memoryFile,
      [
        "# Senior Engineer Project Memory",
        "",
        "Do not store secrets here.",
        "",
        "## Project",
        "",
        `Path: ${projectPath}`,
        "",
        "## Understanding",
        "",
        "Unknown yet.",
        "",
        "## Tech Stack",
        "",
        "Unknown yet.",
        "",
        "## Architecture",
        "",
        "Unknown yet.",
        "",
        "## Commands",
        "",
        "Unknown yet.",
        "",
        "## Risks / TODO",
        "",
        "Unknown yet.",
        "",
        "## Task History",
        "",
      ].join("\n"),
      "utf-8"
    );
  }

  return memoryFile;
}

async function readMemory(): Promise<{ file: string; content: string }> {
  const file = await getMemoryFile();
  const content = await fs.readFile(file, "utf-8");
  return { file, content };
}

async function appendMemory(title: string, note: string): Promise<string> {
  const file = await getMemoryFile();
  const entry = [
    "",
    "---",
    "",
    `## ${new Date().toISOString()} - ${title}`,
    "",
    note.trim(),
    "",
  ].join("\n");

  await fs.appendFile(file, entry, "utf-8");
  return file;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("memory_show", {
    description: "Show Senior Engineer per-project memory for the current working directory",
    handler: async (_args, _ctx) => {
      const { file, content } = await readMemory();
      pi.sendMessage({
        customType: "senior-engineer-memory",
        display: true,
        content: ["# Current Project Memory", "", `File: ${file}`, "", content].join("\n"),
      });
    },
  });

  pi.registerCommand("memory_path", {
    description: "Show path of current project memory file",
    handler: async (_args, ctx) => {
      const file = await getMemoryFile();
      ctx.ui.notify(`Memory file: ${file}`, "info");
      pi.sendMessage({
        customType: "senior-engineer-memory",
        display: true,
        content: `Project memory file:\n\n${file}`,
      });
    },
  });

  pi.registerCommand("memory_update", {
    description: "Append a note to the current project memory. Usage: /memory_update <note>",
    handler: async (args, ctx) => {
      const note = (args || "").trim();
      if (!note) {
        ctx.ui.notify("Isi catatan memory dulu. Contoh: /memory:update Project memakai Next.js dan PostgreSQL", "warning");
        return;
      }

      const file = await appendMemory("Manual Memory Update", note);
      ctx.ui.notify("Project memory updated", "info");
      pi.sendMessage({
        customType: "senior-engineer-memory",
        display: true,
        content: `Memory updated:\n\n${file}`,
      });
    },
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    const { file, content } = await readMemory();
    const memoryPreview = content.length > 6000 ? `${content.slice(0, 6000)}\n\n[Memory truncated]` : content;

    return {
      systemPrompt:
        event.systemPrompt +
        [
          "",
          "---",
          "SENIOR ENGINEER PROJECT MEMORY",
          `Memory file: ${file}`,
          "Use this memory as project context. Never store or expose secrets.",
          "",
          memoryPreview,
          "---",
        ].join("\n"),
    };
  });
}
