/**
 * Senior Engineer Project Memory Extension v3
 *
 * Combines structured 7-section project memory with Hermes-style
 * auto-learning, correction detection, failure memory, and session flush.
 *
 * Commands:
 * - /memory_show
 * - /memory_update <note>
 * - /memory_path
 * - /memory-insights
 * - /memory-consolidate
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const MEMORY_ROOT = path.join(os.homedir(), ".pi", "agent", "memories", "senior-engineer-workflow", "projects");
const GLOBAL_MEMORY_DIR = path.join(os.homedir(), ".pi", "agent", "pi-hermes-memory");
const ENTRY_DELIMITER = "\n§\n";
const MEMORY_CHAR_LIMIT = 5000;
const USER_CHAR_LIMIT = 5000;
const NUDGE_INTERVAL = 10;
const NUDGE_TOOL_CALLS = 15;
const FLUSH_MIN_TURNS = 6;

const MEMORY_FILE = "MEMORY.md";
const USER_FILE = "USER.md";
const FAILURE_FILE = "failures.md";

function slugifyProjectPath(projectPath: string): string {
  return projectPath
    .replace(os.homedir(), "home")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

// ─── Structured 7-Section Memory (original) ───

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

async function updateMemorySection(section: string, content: string): Promise<string> {
  const file = await getMemoryFile();
  const existing = await fs.readFile(file, "utf-8");
  const sectionHeader = `## ${section}`;
  const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHeader}\\n\\n)(?:.|\\n)*?(?=\\n## |\\n$)`);

  let updated: string;
  if (regex.test(existing)) {
    updated = existing.replace(regex, `$1${content.trim()}`);
  } else {
    updated = existing.trimEnd() + `\n\n${sectionHeader}\n\n${content.trim()}\n`;
  }
  await fs.writeFile(file, updated, "utf-8");
  return file;
}

// ─── MemoryStore (Hermes-style) ───

class MemoryStore {
  private memoryEntries: string[] = [];
  private userEntries: string[] = [];
  private failureEntries: string[] = [];
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir || GLOBAL_MEMORY_DIR;
  }

  private pathFor(target: "memory" | "user" | "failure"): string {
    if (target === "user") return path.join(this.dir, USER_FILE);
    if (target === "failure") return path.join(this.dir, FAILURE_FILE);
    return path.join(this.dir, MEMORY_FILE);
  }

  private entriesFor(target: "memory" | "user" | "failure"): string[] {
    if (target === "user") return this.userEntries;
    if (target === "failure") return this.failureEntries;
    return this.memoryEntries;
  }

  private setEntries(target: "memory" | "user" | "failure", entries: string[]): void {
    if (target === "user") this.userEntries = entries;
    else if (target === "failure") this.failureEntries = entries;
    else this.memoryEntries = entries;
  }

  private charLimit(target: "memory" | "user" | "failure"): number {
    if (target === "failure") return MEMORY_CHAR_LIMIT * 2;
    return target === "user" ? USER_CHAR_LIMIT : MEMORY_CHAR_LIMIT;
  }

  async loadFromDisk(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    this.memoryEntries = await this.readFile(this.pathFor("memory"));
    this.userEntries = await this.readFile(this.pathFor("user"));
    this.failureEntries = await this.readFile(this.pathFor("failure"));
    this.memoryEntries = [...new Set(this.memoryEntries)];
    this.userEntries = [...new Set(this.userEntries)];
    this.failureEntries = [...new Set(this.failureEntries)];
  }

  private async readFile(filePath: string): Promise<string[]> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      if (!raw.trim()) return [];
      return raw.split(ENTRY_DELIMITER).map((e) => e.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async saveToDisk(target: "memory" | "user" | "failure"): Promise<void> {
    const filePath = this.pathFor(target);
    const entries = this.entriesFor(target);
    const content = entries.length ? entries.join(ENTRY_DELIMITER) : "";
    await fs.writeFile(filePath, content, "utf-8");
  }

  async add(target: "memory" | "user" | "failure", content: string): Promise<{ success: boolean; error?: string; message?: string; usage?: string; entry_count?: number }> {
    content = content.trim();
    if (!content) return { success: false, error: "Content cannot be empty." };

    const entries = this.entriesFor(target);
    const limit = this.charLimit(target);

    const stripped = entries.map((e) => this.stripMetadata(e));
    if (stripped.includes(content)) {
      return { success: true, message: "Entry already exists (no duplicate added)." };
    }

    const encoded = this.encodeEntry(content);
    const newTotal = [...entries, encoded].join(ENTRY_DELIMITER).length;

    if (newTotal > limit) {
      return { success: false, error: `Memory at limit (${newTotal}/${limit} chars). Remove or consolidate first.` };
    }

    entries.push(encoded);
    this.setEntries(target, entries);
    await this.saveToDisk(target);

    const current = this.charCount(target, entries);
    const pct = limit > 0 ? Math.min(100, Math.floor((current / limit) * 100)) : 0;
    return { success: true, message: "Entry added.", usage: `${pct}% — ${current}/${limit} chars`, entry_count: entries.length };
  }

  getMemoryEntries(): string[] {
    return this.memoryEntries.map((e) => this.stripMetadata(e));
  }

  getUserEntries(): string[] {
    return this.userEntries.map((e) => this.stripMetadata(e));
  }

  getFailureEntries(maxAgeDays = 7): string[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    return this.failureEntries
      .filter((entry) => {
        const decoded = this.decodeEntry(entry);
        return decoded.created >= cutoffStr;
      })
      .map((entry) => this.stripMetadata(entry));
  }

  private charCount(target: "memory" | "user" | "failure", entries?: string[]): number {
    const e = entries || this.entriesFor(target);
    return e.length ? e.join(ENTRY_DELIMITER).length : 0;
  }

  private encodeEntry(text: string): string {
    const today = new Date().toISOString().split("T")[0];
    return `${text} <!-- created=${today}, last=${today} -->`;
  }

  private decodeEntry(raw: string): { text: string; created: string; lastReferenced: string } {
    const match = raw.match(/^(.*?)\s*<!--\s*created=([^,]+),\s*last=([^>]+)\s*-->\s*$/);
    if (match) {
      return { text: match[1].trim(), created: match[2].trim(), lastReferenced: match[3].trim() };
    }
    const today = new Date().toISOString().split("T")[0];
    return { text: raw.trim(), created: today, lastReferenced: today };
  }

  private stripMetadata(text: string): string {
    return this.decodeEntry(text).text;
  }

  formatMemoryBlock(): string {
    const parts: string[] = [];
    if (this.memoryEntries.length) {
      const mem = this.memoryEntries.map((e) => this.stripMetadata(e)).join("\n");
      parts.push(`═══ MEMORY ═══\n${mem}`);
    }
    if (this.userEntries.length) {
      const user = this.userEntries.map((e) => this.stripMetadata(e)).join("\n");
      parts.push(`═══ USER PROFILE ═══\n${user}`);
    }
    const recentFailures = this.getFailureEntries(7);
    if (recentFailures.length > 0) {
      const failures = recentFailures.slice(0, 5).map((e) => "• " + e).join("\n");
      parts.push(`═══ RECENT FAILURES ═══\n${failures}`);
    }
    return parts.join("\n\n");
  }
}

// ─── Pattern-based correction detection ───

const CORRECTION_STRONG_PATTERNS = [
  /don'?t do that/i,
  /not like that/i,
  /^I said\b/i,
  /^I told you\b/i,
  /we already discussed/i,
  /^please don'?t/i,
  /^that'?s not what I/i,
];

const CORRECTION_WEAK_PATTERNS = [
  /^no[,\.\s!]/i,
  /^wrong[,\.\s!]/i,
  /^actually[,\.\s]/i,
  /^stop[,\.\s!]/i,
];

const CORRECTION_NEGATIVE_PATTERNS = [
  /^no worries/i,
  /^no problem/i,
  /^no thanks/i,
  /^no need/i,
  /^actually.{0,10}(looks? great|perfect|good|correct|right)/i,
  /^stop.{0,5}(there|here|for now)/i,
];

const CORRECTION_DIRECTIVE_WORDS = [
  "use", "don't", "dont", "do", "try", "make", "run", "install",
  "add", "remove", "delete", "change", "fix", "put", "set",
  "write", "go", "stop", "start", "the", "that", "this", "it",
];

function isCorrection(text: string): boolean {
  for (const pattern of CORRECTION_NEGATIVE_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  for (const pattern of CORRECTION_STRONG_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  for (const pattern of CORRECTION_WEAK_PATTERNS) {
    if (pattern.test(text)) {
      const match = pattern.exec(text);
      if (match && match.index === 0) {
        const remainder = text.slice(match[0].length).trim();
        const re = new RegExp(`\\b(${CORRECTION_DIRECTIVE_WORDS.join("|")})\\b`, "i");
        if (re.test(remainder)) return true;
      }
    }
  }
  return false;
}

function getMessageText(msg: unknown, maxLength = 500): string | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (typeof m.role !== "string") return null;
  if (typeof m.content === "string") return m.content.slice(0, maxLength);
  if (Array.isArray(m.content)) {
    const text = m.content
      .filter((b: unknown) => (b as Record<string, unknown>).type === "text")
      .map((b: unknown) => (b as Record<string, unknown>).text as string)
      .join("\n");
    return text.length > 0 ? text.slice(0, maxLength) : null;
  }
  return null;
}

// ─── Extension Main ───

export default function (pi: ExtensionAPI) {
  const store = new MemoryStore();
  let userTurnCount = 0;
  let turnsSinceReview = 0;
  let toolCallsSinceReview = 0;
  let reviewInProgress = false;
  let pendingCorrection = false;
  let turnsSinceLastCorrection = 3;
  let correctionInProgress = false;

  // ─── Load memory on session start ───

  pi.on("session_start", async () => {
    await store.loadFromDisk();
  });

  // ─── Track turns + detect corrections ───

  pi.on("message_end", async (event) => {
    if (event.message.role === "user") {
      userTurnCount++;
      const text = getMessageText(event.message);
      if (text && isCorrection(text)) {
        pendingCorrection = true;
      }
    }
  });

  // ─── Background review loop ───

  pi.on("turn_end", async (event, ctx) => {
    turnsSinceReview++;

    try {
      const msg = event.message;
      if (msg?.role === "assistant") {
        const content = msg?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === "object" && block.type === "toolCall") {
              toolCallsSinceReview++;
            }
          }
        }
      }
    } catch {}

    // Background review
    if (!reviewInProgress && userTurnCount >= 3) {
      const turnMet = turnsSinceReview >= NUDGE_INTERVAL;
      const toolMet = toolCallsSinceReview >= NUDGE_TOOL_CALLS;
      if (turnMet || toolMet) {
        turnsSinceReview = 0;
        toolCallsSinceReview = 0;
        reviewInProgress = true;

        let parts: string[] = [];
        try {
          const entries = ctx.sessionManager.getBranch();
          for (const entry of entries) {
            if (entry.type !== "message") continue;
            const msg = entry.message;
            const text = getMessageText(msg);
            if (!text) continue;
            const prefix = msg.role === "user" ? "[USER]" : "[ASSISTANT]";
            parts.push(`${prefix}: ${text.slice(0, 300)}`);
          }
        } catch {}

        if (parts.length >= 4) {
          const currentMemory = store.getMemoryEntries().join("\n");
          const currentUser = store.getUserEntries().join("\n");
          const prompt = `Review this conversation for things worth saving to persistent memory:

Current Memory:
${currentMemory || "(empty)"}

Current User Profile:
${currentUser || "(empty)"}

Conversation:
${parts.slice(-20).join("\n\n")}

Consider:
1. User preferences, habits, personal details → save to 'user'
2. Environment facts, project conventions, tool quirks → save to 'memory'
3. Failures, what didn't work → save as failure with category

If nothing worth saving, respond "Nothing to save."`;

          const result = await pi.exec("pi", ["-p", "--no-session", prompt], {
            signal: ctx.signal,
            timeout: 30000,
          }) as { code: number; stdout?: string; stderr?: string };

          if (result.code === 0 && result.stdout) {
            const output = result.stdout.trim();
            if (output && !output.toLowerCase().includes("nothing to save")) {
              ctx.ui.notify("💾 Memory auto-reviewed", "info");
            }
          }
        }
        reviewInProgress = false;
      }
    }

    // Correction detection
    if (pendingCorrection && turnsSinceLastCorrection >= 3 && !correctionInProgress) {
      pendingCorrection = false;
      turnsSinceLastCorrection = 0;
      correctionInProgress = true;

      try {
        const entries = ctx.sessionManager.getBranch();
        const parts: string[] = [];
        for (const entry of entries) {
          if (entry.type !== "message") continue;
          const msg = entry.message;
          const text = getMessageText(msg);
          if (!text) continue;
          const prefix = msg.role === "user" ? "[USER]" : "[ASSISTANT]";
          parts.push(`${prefix}: ${text}`);
        }

        const recentParts = parts.slice(-6);
        const currentMemory = store.getMemoryEntries().join("\n");
        const currentUser = store.getUserEntries().join("\n");

        const prompt = `The user just corrected you. Review and save to persistent memory.

Current Memory:
${currentMemory || "(empty)"}

Current User Profile:
${currentUser || "(empty)"}

Recent Conversation:
${recentParts.join("\n\n")}

Priority:
1. User preference ("don't do X", "always use Y instead")
2. Wrong assumption you made
3. Environment fact you got wrong

If nothing to save, respond "Nothing to save."`;

        const result = await pi.exec("pi", ["-p", "--no-session", prompt], {
          signal: ctx.signal,
          timeout: 30000,
        }) as { code: number; stdout?: string; stderr?: string };

        if (result.code === 0 && result.stdout) {
          const output = result.stdout.trim();
          if (output && !output.toLowerCase().includes("nothing to save")) {
            ctx.ui.notify("🔧 Correction saved to memory", "info");
          }
        }
      } catch {}
      correctionInProgress = false;
    }

    if (!pendingCorrection) {
      turnsSinceLastCorrection++;
    }
  });

  // ─── Session flush ───

  pi.on("session_before_compact", async (_event, ctx) => {
    if (userTurnCount < FLUSH_MIN_TURNS) return;
    let entries;
    try {
      entries = ctx.sessionManager.getBranch();
    } catch {
      return;
    }
    const parts: string[] = [];
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      const text = getMessageText(msg);
      if (!text) continue;
      parts.push(`${msg.role === "user" ? "[USER]" : "[ASSISTANT]"}: ${text}`);
    }

    const prompt = `[System: Session is being compressed. Save anything worth remembering — prioritize user preferences, corrections, and patterns.]\n\nConversation:\n${parts.slice(-30).join("\n\n")}`;

    try {
      await pi.exec("pi", ["-p", "--no-session", prompt], {
        signal: ctx.signal,
        timeout: 15000,
      });
    } catch {}
  });

  // ─── Inject memory into system prompt ───

  pi.on("before_agent_start", async (event, _ctx) => {
    const { content } = await readMemory();
    const structuredPreview = content.length > 4000 ? content.slice(0, 4000) + "\n\n[Structured memory truncated]" : content;
    const autoMemory = store.formatMemoryBlock();
    const memoryContent = autoMemory
      ? `${structuredPreview}\n\n---\n\n${autoMemory}`
      : structuredPreview;

    return {
      systemPrompt:
        event.systemPrompt +
        [
          "",
          "---",
          "SENIOR ENGINEER PROJECT MEMORY",
          "Persistent memory from previous sessions is below.",
          "This is NOT new user input — read it as reference context.",
          "To save new memory, use the `memory` tool (add/replace/remove).",
          "",
          memoryContent,
          "---",
        ].join("\n"),
    };
  });

  // ─── Memory tool (AI-callable) ───

  pi.registerTool({
    name: "memory",
    label: "Memory",
    description: "Save durable information to persistent memory across sessions. Targets: 'user' for who the user is, 'memory' for global facts, 'failure' for what didn't work. Actions: add, replace, remove.",
    parameters: Type.Object({
      action: Type.String({ description: "add, replace, or remove" }),
      target: Type.String({ description: "memory, user, or failure" }),
      content: Type.Optional(Type.String({ description: "Content for add/replace" })),
      old_text: Type.Optional(Type.String({ description: "Substring to identify entry for replace/remove" })),
      category: Type.Optional(Type.String({ description: "For failure target: failure, correction, insight, preference, convention, tool-quirk" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { action, target, content, old_text } = params as Record<string, string>;
      const t = target as "memory" | "user" | "failure";

      if (action === "add" && content) {
        const result = await store.add(t, content);
        if (result.success) {
          ctx.ui.notify(`💾 ${target} memory saved`, "info");
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      }

      if (action === "replace" && content && old_text) {
        return { content: [{ type: "text", text: "Replace not yet implemented in simple mode — use add instead." }], details: {} };
      }

      if (action === "remove" && old_text) {
        return { content: [{ type: "text", text: "Remove not yet implemented in simple mode." }], details: {} };
      }

      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown action '${action}' or missing required fields.` }) }], details: {} };
    },
  });

  // ─── Commands ───

  pi.registerCommand("memory_show", {
    description: "Show structured project memory for current working directory",
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
    description: "Append a note to structured project memory. Usage: /memory_update <note>",
    handler: async (args, ctx) => {
      const note = (args || "").trim();
      if (!note) {
        ctx.ui.notify("Isi catatan memory dulu.", "warning");
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

  pi.registerCommand("memory-insights", {
    description: "Show what is stored in persistent memory (global + failures)",
    handler: async (_args, ctx) => {
      const mem = store.getMemoryEntries();
      const user = store.getUserEntries();
      const failures = store.getFailureEntries(7);

      const lines: string[] = [
        `╔${"═".repeat(46)}╗`,
        "║            🧠 Memory Insights              ║",
        `╚${"═".repeat(46)}╝`,
        "",
      ];

      if (mem.length) {
        lines.push("📋 MEMORY (your personal notes)");
        lines.push("─".repeat(46));
        mem.forEach((e, i) => lines.push(`${i + 1}. ${e}`));
        lines.push("");
      } else {
        lines.push("📋 MEMORY: (empty)");
        lines.push("");
      }

      if (user.length) {
        lines.push("👤 USER PROFILE");
        lines.push("─".repeat(46));
        user.forEach((e, i) => lines.push(`${i + 1}. ${e}`));
        lines.push("");
      } else {
        lines.push("👤 USER PROFILE: (empty)");
        lines.push("");
      }

      if (failures.length) {
        lines.push("⚠️  RECENT FAILURES (last 7 days)");
        lines.push("─".repeat(46));
        failures.forEach((e, i) => lines.push(`${i + 1}. ${e}`));
        lines.push("");
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("memory-consolidate", {
    description: "Manually trigger memory consolidation to free up space",
    handler: async (_args, ctx) => {
      const memEntries = store.getMemoryEntries();
      const userEntries = store.getUserEntries();

      if (!memEntries.length && !userEntries.length) {
        ctx.ui.notify("Memory is empty — nothing to consolidate.", "info");
        return;
      }

      ctx.ui.notify("⏳ Consolidating memory...", "info");

      const prompt = [
        "The memory is at capacity. Consolidate by merging related entries, removing outdated ones, keeping the most important facts.",
        "",
        "--- Current Memory Entries ---",
        memEntries.join("\n---\n"),
        "",
        "--- Current User Profile ---",
        userEntries.join("\n---\n") || "(empty)",
        "",
        "Use the memory tool to make changes. Be aggressive about merging — less is more.",
      ].join("\n");

      try {
        const result = await pi.exec("pi", ["-p", "--no-session", prompt], {
          signal: ctx.signal,
          timeout: 120000,
        }) as { code: number; stdout?: string; stderr?: string };

        if (result.code === 0) {
          await store.loadFromDisk();
          ctx.ui.notify("✅ Memory consolidated and reloaded", "info");
        } else {
          ctx.ui.notify("❌ Consolidation failed", "error");
        }
      } catch {
        ctx.ui.notify("❌ Consolidation failed", "error");
      }
    },
  });
}
