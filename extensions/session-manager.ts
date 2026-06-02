import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SESSION_DIR = path.join(os.homedir(), ".pi", "agent", "sessions");
const LAST_SESSION_FILE = path.join(os.homedir(), ".pi", "agent", "last-session.json");

interface SessionEntry {
  id: string;
  file: string;
  timestamp: string;
  cwd: string;
  messageCount: number;
  firstUserMessage: string;
  model: string;
  provider: string;
}

interface LastSessionData {
  projectCwd: string;
  sessionFile: string | undefined;
  sessionId: string;
  messageCount: number;
  timestamp: string;
}

function slugifyProjectPath(p: string): string {
  return "--" + p.replace(/^\/Users\/[^/]+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "--";
}

function projectDir(cwd: string): string {
  return path.join(SESSION_DIR, slugifyProjectPath(cwd));
}

function projectKey(cwd: string): string {
  return slugifyProjectPath(cwd).replace(/^--|--$/g, "");
}

async function parseSessionFile(filePath: string): Promise<SessionEntry | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length === 0) return null;

    const header = JSON.parse(lines[0]);
    if (header.type !== "session") return null;

    let messageCount = 0;
    let firstUserMessage = "";
    let model = "";
    let provider = "";

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message?.role === "user") {
          messageCount++;
          if (!firstUserMessage) {
            const text = extractText(entry.message.content);
            firstUserMessage = text.slice(0, 120);
          }
        }
        if (entry.type === "model_change") {
          model = entry.modelId || "";
          provider = entry.provider || "";
        }
      } catch {}
    }

    return {
      id: header.id,
      file: filePath,
      timestamp: header.timestamp,
      cwd: header.cwd || "",
      messageCount,
      firstUserMessage: firstUserMessage || "(no messages)",
      model,
      provider,
    };
  } catch {
    return null;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: unknown) => typeof b === "object" && b !== null && (b as Record<string, unknown>).type === "text")
      .map((b: unknown) => (b as Record<string, unknown>).text as string)
      .join("\n");
  }
  return "";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function loadLastSessions(): Record<string, LastSessionData> {
  try {
    const raw = fsSync.readFileSync(LAST_SESSION_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLastSession(project: string, data: LastSessionData) {
  const all = loadLastSessions();
  all[project] = data;
  try {
    fsSync.mkdirSync(path.dirname(LAST_SESSION_FILE), { recursive: true });
    fsSync.writeFileSync(LAST_SESSION_FILE, JSON.stringify(all, null, 2), "utf-8");
  } catch {}
}

export default function (pi: ExtensionAPI) {
  // ─── On startup: notify if there's a last session ───

  pi.on("session_start", (event, ctx) => {
    if (event.reason !== "startup") return;

    const pk = projectKey(process.cwd());
    const last = loadLastSessions()[pk];
    if (!last || !last.sessionFile) return;

    try {
      if (!fsSync.existsSync(last.sessionFile)) return;
    } catch { return; }

    const ago = relativeDate(last.timestamp);
    ctx.ui.notify(
      `Ada session sebelumnya (${ago}, ${last.messageCount} pesan).\n` +
      `Gunakan /resume_last untuk lanjut (history lengkap).\n` +
      `Atau /fork_last untuk branching dari session terakhir.`,
      "info"
    );
  });

  // ─── On shutdown: save this session as "last" for this project ───

  pi.on("session_shutdown", (event, ctx) => {
    const now = new Date();
    const dateStr = now.toISOString();
    const reason = event.reason;
    const summaryDir = path.join(os.homedir(), ".pi", "agent", "session-summaries");
    try { fsSync.mkdirSync(summaryDir, { recursive: true }); } catch {}

    try {
      const entries = ctx.sessionManager.getBranch();
      let userCount = 0;
      let lastUser = "";

      for (const entry of entries) {
        if (entry.type !== "message") continue;
        const msg = entry.message;
        if (msg.role === "user") {
          userCount++;
          const text = extractText(msg.content);
          if (text) lastUser = text.slice(0, 150);
        }
      }

      // Save as "last session" for this project
      const sessionFile = ctx.sessionManager.getSessionFile();
      const sessionId = ctx.sessionManager.getSessionId();
      if (sessionFile && reason !== "fork") {
        saveLastSession(projectKey(process.cwd()), {
          projectCwd: process.cwd(),
          sessionFile,
          sessionId,
          messageCount: userCount,
          timestamp: dateStr,
        });
      }

      // Write daily summary
      const summary = [
        `## Session ${now.toLocaleString("id-ID")}`,
        `- Reason: ${reason}`,
        `- CWD: ${process.cwd()}`,
        `- Messages: ${userCount} user turns`,
        `- Last: ${lastUser || "(none)"}`,
        "",
      ].join("\n") + "\n";

      const summaryFile = path.join(summaryDir, `${dateStr.split("T")[0]}.md`);
      fsSync.appendFileSync(summaryFile, `\n---\n\n${summary}`, "utf-8");
    } catch {}
  });

  // ─── /resume_last — switch to last session (full history preserved) ───

  pi.registerCommand("resume_last", {
    description: "Lanjut session terakhir — history lengkap dari awal.",
    handler: async (_args, ctx) => {
      const pk = projectKey(process.cwd());
      const last = loadLastSessions()[pk];
      if (!last || !last.sessionFile) {
        ctx.ui.notify("Tidak ada session sebelumnya untuk project ini.", "warning");
        return;
      }

      try {
        if (!fsSync.existsSync(last.sessionFile)) {
          ctx.ui.notify("File session sudah tidak ada.", "warning");
          return;
        }
      } catch {
        ctx.ui.notify("Gagal cek file session.", "error");
        return;
      }

      ctx.ui.notify(`Beralih ke session ${last.sessionId.slice(0, 8)} (${last.messageCount} pesan)...\nHistory lengkap akan dimuat ulang.`, "info");

      try {
        await ctx.switchSession(last.sessionFile);
      } catch (e) {
        ctx.ui.notify(`Gagal resume: ${e}`, "error");
      }
    },
  });

  // ─── /fork_last — fork from last session (branch, memory diwarisi) ───

  pi.registerCommand("fork_last", {
    description: "Branching dari session terakhir — history diwarisi, memory tetap.",
    handler: async (_args, ctx) => {
      const pk = projectKey(process.cwd());
      const last = loadLastSessions()[pk];
      if (!last || !last.sessionFile) {
        ctx.ui.notify("Tidak ada session sebelumnya untuk project ini.", "warning");
        return;
      }

      const cmd = `pi --fork "${last.sessionFile}" --session-dir ~/.pi/agent/sessions`;

      ctx.ui.notify(
        [
          `Fork dari session ${last.sessionId.slice(0, 8)} (${last.messageCount} pesan):`,
          "",
          `  ${cmd}`,
          "",
          "Jalankan di terminal baru. Memory akan tetap sama",
          "karena disimpan di file terpisah.",
        ].join("\n"),
        "info"
      );
    },
  });

  // ─── /session list ───

  pi.registerCommand("session_list", {
    description: "List all sessions for current project. Usage: /session_list [limit=N]",
    handler: async (args, ctx) => {
      const limit = parseInt((args || "").match(/limit=(\d+)/)?.[1] ?? "20", 10);
      const dir = projectDir(process.cwd());

      let files: string[];
      try {
        files = await fs.readdir(dir);
      } catch {
        ctx.ui.notify("No sessions found for this project.", "info");
        return;
      }

      const jsonlFiles = files
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse()
        .slice(0, limit);

      if (jsonlFiles.length === 0) {
        ctx.ui.notify("No sessions found for this project.", "info");
        return;
      }

      const sessions: SessionEntry[] = [];
      for (const file of jsonlFiles) {
        const entry = await parseSessionFile(path.join(dir, file));
        if (entry) sessions.push(entry);
      }

      const lines: string[] = [
        `╔${"═".repeat(56)}╗`,
        "║              📋 Session History               ║",
        `╚${"═".repeat(56)}╝`,
        "",
        `Project: ${process.cwd()}`,
        `Total: ${sessions.length} sessions`,
        "",
      ];

      sessions.forEach((s, i) => {
        const date = relativeDate(s.timestamp);
        const time = formatDate(s.timestamp);
        const msgs = `${s.messageCount} messages`;
        const preview = s.firstUserMessage.length > 50
          ? s.firstUserMessage.slice(0, 47) + "..."
          : s.firstUserMessage;
        lines.push(`  ${i + 1}. [${date}] ${msgs}`);
        lines.push(`     ${time}`);
        lines.push(`     "${preview}"`);
        lines.push(`     id: ${s.id.slice(0, 8)}`);
        lines.push("");
      });

      lines.push("Commands:");
      lines.push(`  /resume_last        — lanjut session terakhir (history penuh)`);
      lines.push(`  /fork_last          — branching dari session terakhir`);
      lines.push(`  /session_show <id>  — show details`);
      lines.push(`  /session_fork <id>  — fork session`);
      lines.push(`  /session_resume <id>— resume session`);
      lines.push(`  /session_export <id>— export to HTML`);

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ─── /session show ───

  pi.registerCommand("session_show", {
    description: "Show session details. Usage: /session_show <id|partial-id>",
    handler: async (args, ctx) => {
      const query = (args || "").trim().toLowerCase();
      if (!query) {
        ctx.ui.notify("Usage: /session_show <id|partial-id>", "warning");
        return;
      }

      const sessions = await findSessions(query);

      if (sessions.length === 0) {
        ctx.ui.notify(`No session found matching "${query}"`, "warning");
        return;
      }

      const s = sessions[0];
      const lines: string[] = [
        `╔${"═".repeat(56)}╗`,
        "║              📄 Session Details               ║",
        `╚${"═".repeat(56)}╝`,
        "",
        `  ID:        ${s.id}`,
        `  Date:      ${formatDate(s.timestamp)}`,
        `  Messages:  ${s.messageCount} user messages`,
        `  Model:     ${s.model || "unknown"}`,
        `  Provider:  ${s.provider || "unknown"}`,
        `  CWD:       ${s.cwd}`,
        "",
        `  First: "${s.firstUserMessage}"`,
        "",
        "Actions:",
        `  Fork:   pi --fork ${s.file}`,
        `  Resume: pi --session ${s.file}`,
        `  Export: pi --export ${s.file}`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ─── /session fork ───

  pi.registerCommand("session_fork", {
    description: "Show fork command for a session. Usage: /session_fork <id|partial-id>",
    handler: async (args, ctx) => {
      const query = (args || "").trim().toLowerCase();
      if (!query) {
        ctx.ui.notify("Usage: /session_fork <id|partial-id>", "warning");
        return;
      }

      const sessions = await findSessions(query);

      if (sessions.length === 0) {
        ctx.ui.notify(`No session found matching "${query}"`, "warning");
        return;
      }

      const s = sessions[0];
      const cmd = `pi --fork "${s.file}" --session-dir ~/.pi/agent/sessions`;

      ctx.ui.notify(
        [
          `Fork command for session ${s.id.slice(0, 8)}:`,
          "",
          `  ${cmd}`,
          "",
          "Run this in a new terminal. The forked session will",
          "inherit project memory from the original session.",
          "Memory is stored in files (not in session), so it persists.",
        ].join("\n"),
        "info"
      );
    },
  });

  // ─── /session resume ───

  pi.registerCommand("session_resume", {
    description: "Show resume command for a session. Usage: /session_resume <id|partial-id>",
    handler: async (args, ctx) => {
      const query = (args || "").trim().toLowerCase();
      if (!query) {
        ctx.ui.notify("Usage: /session_resume <id|partial-id>", "warning");
        return;
      }

      const sessions = await findSessions(query);

      if (sessions.length === 0) {
        ctx.ui.notify(`No session found matching "${query}"`, "warning");
        return;
      }

      const s = sessions[0];
      const cmd = `pi --session "${s.file}"`;

      ctx.ui.notify(
        [
          `Resume command for session ${s.id.slice(0, 8)}:`,
          "",
          `  ${cmd}`,
          "",
          "Run this in a new terminal to resume the session.",
          `It will continue from where you left off (${s.messageCount} messages).`,
        ].join("\n"),
        "info"
      );
    },
  });

  // ─── /session export ───

  pi.registerCommand("session_export", {
    description: "Export session to HTML. Usage: /session_export <id|partial-id>",
    handler: async (args, ctx) => {
      const query = (args || "").trim().toLowerCase();
      if (!query) {
        ctx.ui.notify("Usage: /session_export <id|partial-id>", "warning");
        return;
      }

      const sessions = await findSessions(query);

      if (sessions.length === 0) {
        ctx.ui.notify(`No session found matching "${query}"`, "warning");
        return;
      }

      const s = sessions[0];
      const outFile = path.join(process.cwd(), `session-${s.id.slice(0, 8)}.html`);

      ctx.ui.notify(`Exporting session ${s.id.slice(0, 8)} to HTML...`, "info");

      try {
        const result = await pi.exec("pi", ["--export", s.file, outFile], {
          timeout: 15000,
        }) as { code: number; stdout?: string; stderr?: string };

        if (result.code === 0) {
          ctx.ui.notify(`✅ Exported to ${outFile}`, "info");
        } else {
          ctx.ui.notify(`❌ Export failed: ${result.stderr || "unknown error"}`, "error");
        }
      } catch (e) {
        ctx.ui.notify(`❌ Export failed: ${e}`, "error");
      }
    },
  });

  // ─── Helper: find sessions by query ───

  async function findSessions(query: string): Promise<SessionEntry[]> {
    const cwd = process.cwd();
    const results: SessionEntry[] = [];

    // Search current project first
    const dir = projectDir(cwd);
    try {
      const files = await fs.readdir(dir);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl")).sort().reverse();

      for (const file of jsonlFiles) {
        const entry = await parseSessionFile(path.join(dir, file));
        if (entry && entry.id.toLowerCase().startsWith(query)) {
          results.push(entry);
        }
      }
    } catch {}

    // If not found in current project, search all projects
    if (results.length === 0) {
      try {
        const projects = await fs.readdir(SESSION_DIR);
        for (const project of projects) {
          if (project === slugifyProjectPath(cwd)) continue;
          try {
            const files = await fs.readdir(path.join(SESSION_DIR, project));
            for (const file of files.filter((f) => f.endsWith(".jsonl"))) {
              const entry = await parseSessionFile(path.join(SESSION_DIR, project, file));
              if (entry && entry.id.toLowerCase().startsWith(query)) {
                results.push(entry);
              }
            }
          } catch {}
        }
      } catch {}
    }

    return results;
  }
}
