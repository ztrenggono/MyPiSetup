import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type DelegateMode = "research" | "review" | "refactor" | "test" | "analyze" | "audit" | "plan" | "explain";

function getDefaultModel(): string {
  try {
    const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    return settings.defaultModel || "gpt-5.5";
  } catch {
    return "gpt-5.5";
  }
}

function getDefaultProvider(): string {
  try {
    const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    return settings.defaultProvider || "openai-codex";
  } catch {
    return "openai-codex";
  }
}

const DELEGATE_MODE_PROMPTS: Record<DelegateMode, string> = {
  research: [
    "You are a research sub-agent. Gather information and provide a structured summary.",
    "",
    "Output:",
    "1. Overview of the topic.",
    "2. Key findings or recommendations.",
    "3. Pros/cons if comparing options.",
    "4. Code examples if relevant.",
    "5. References or sources.",
    "6. Risks or considerations.",
    "",
    "Be thorough but concise. Do not edit any project files.",
  ].join("\n"),

  review: [
    "You are a code review sub-agent. Review code changes and flag issues.",
    "",
    "Output:",
    "1. Summary of what is being reviewed.",
    "2. P0 findings (critical).",
    "3. P1 findings (important).",
    "4. P2 findings (improvement).",
    "5. Overall recommendation.",
    "",
    "Be strict like a senior engineer.",
  ].join("\n"),

  refactor: [
    "You are a refactoring sub-agent. Analyze code structure and propose improvements.",
    "",
    "Output:",
    "1. Current problems or pain points.",
    "2. Proposed refactoring strategy.",
    "3. Files that would be affected.",
    "4. Migration plan if breaking changes.",
    "5. Risk analysis.",
    "6. Test strategy.",
    "",
    "Do not make changes yourself. Only propose the plan.",
  ].join("\n"),

  test: [
    "You are a testing sub-agent. Analyze the project and generate a test plan.",
    "",
    "Output:",
    "1. What should be tested.",
    "2. Test scenarios or test cases.",
    "3. Tools and commands to use.",
    "4. Edge cases to cover.",
    "5. How to verify correctness.",
    "",
    "Do not create test files yourself unless explicitly requested.",
  ].join("\n"),

  analyze: [
    "You are a code analysis sub-agent.",
    "",
    "Output:",
    "1. Overall code quality assessment.",
    "2. Complexity hotspots.",
    "3. Dependency analysis.",
    "4. Code duplication areas.",
    "5. Pattern violations or anti-patterns.",
    "6. Recommendations.",
    "",
    "Do not edit any files.",
  ].join("\n"),

  audit: [
    "You are an audit sub-agent. Perform a focused security or production readiness audit.",
    "",
    "Output:",
    "1. Scope of audit.",
    "2. Findings with P0/P1/P2 labels.",
    "3. Risk assessment.",
    "4. Recommended fixes.",
    "5. Priority order.",
    "",
    "Do not make changes. Only report findings.",
  ].join("\n"),

  plan: [
    "You are a planning sub-agent. Create a detailed implementation plan.",
    "",
    "Output:",
    "1. Understanding of the request.",
    "2. Files to inspect.",
    "3. Architecture or design decisions.",
    "4. Step-by-step implementation plan.",
    "5. Files to change.",
    "6. Risk analysis.",
    "7. Test plan.",
    "8. Estimated effort (small, medium, large).",
    "",
    "Do not make any changes. Only provide the plan.",
  ].join("\n"),

  explain: [
    "You are an explainer sub-agent. Explain how code, a feature, or architecture works.",
    "",
    "Output:",
    "1. Overview.",
    "2. How it works step by step.",
    "3. Important details or tricky parts.",
    "4. Dependencies and integrations.",
    "5. Potential issues or footguns.",
    "",
    "Be clear and educational. Use examples when helpful.",
  ].join("\n"),
};



function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && !currentScript.startsWith("/$bunfs/root/") && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  return { command: "pi", args };
}

interface DelegateTask {
  id: string;
  mode: DelegateMode;
  task: string;
  cwd: string;
  tmpDir: string;
  startedAt: number;
}

let activeDelegates: DelegateTask[] = [];

function tmpDirFor(mode: string, task: string): { dir: string; promptPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "senior-engineer-delegate-"));
  const safeName = mode.replace(/[^\w.-]+/g, "_");
  const promptPath = path.join(dir, `prompt-${safeName}.md`);
  return { dir, promptPath };
}

function writePrompt(agentPrompt: string, promptPath: string) {
  fs.writeFileSync(promptPath, agentPrompt, "utf-8");
}

function buildAgentPrompt(mode: DelegateMode, task: string): string {
  const lines: string[] = [
    "# Task Delegation",
    "",
    `Mode: ${mode}`,
    "",
    "---",
    "",
    DELEGATE_MODE_PROMPTS[mode],
    "",
    "---",
    "",
    `## Task`,
    "",
    task || "(no specific task provided)",
    "",
  ];
  return lines.join("\n");
}

function runPiWithPrompt(
  promptPath: string,
  _mode: DelegateMode,
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: (msg: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const provider = getDefaultProvider();
    const model = getDefaultModel();
    const piArgs: string[] = ["-p", "--no-session", "--provider", provider];
    if (model) piArgs.push("--model", model);

    const invocation = getPiInvocation(piArgs);
    const proc = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    // Read prompt file and pipe to sub-agent's stdin
    const promptContent = fs.readFileSync(promptPath, "utf-8");
    proc.stdin.write(promptContent);
    proc.stdin.end();

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      onUpdate?.(chunk);
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (signal?.aborted) {
        reject(new Error("ABORTED"));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Sub-agent exited with code ${code}\nStderr: ${stderr.slice(0, 1000)}`));
        return;
      }
      resolve(stdout);
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn sub-agent: ${err.message}`));
    });

    if (signal) {
      if (signal.aborted) {
        proc.kill("SIGTERM");
        setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
        reject(new Error("ABORTED"));
        return;
      }
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
        setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
      }, { once: true });
    }
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event) => {
    activeDelegates = [];
  });

  pi.on("session_shutdown", async (_event) => {
    for (const d of activeDelegates) {
      try { fs.rmSync(d.tmpDir, { recursive: true, force: true }); } catch { }
    }
    activeDelegates = [];
  });

  pi.registerCommand("delegate", {
    description: "Spawn a focused sub-agent with isolated context. Usage: /delegate <mode> <task>. Modes: research, review, refactor, test, analyze, audit, plan, explain",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("delegate requires interactive mode", "error");
        return;
      }

      const trimmed = (args || "").trim();
      if (!trimmed) {
        ctx.ui.notify("Usage: /delegate <mode> <task>. Modes: research, review, refactor, test, analyze, audit, plan, explain", "warning");
        return;
      }

      const tokens = trimmed.split(/\s+/);
      const modes: DelegateMode[] = ["research", "review", "refactor", "test", "analyze", "audit", "plan", "explain"];
      let mode: DelegateMode = "research";
      let task: string;

      if (modes.includes(tokens[0] as DelegateMode)) {
        mode = tokens[0] as DelegateMode;
        task = tokens.slice(1).join(" ").trim();
      } else {
        task = trimmed;
      }

      if (!task) {
        ctx.ui.notify("Provide a task description.", "warning");
        return;
      }

      const agentPrompt = buildAgentPrompt(mode, task);
      const { dir, promptPath } = tmpDirFor(mode, task);
      writePrompt(agentPrompt, promptPath);

      const delegateId = `delegate-${Date.now()}`;
      activeDelegates.push({ id: delegateId, mode, task, cwd: ctx.cwd, tmpDir: dir, startedAt: Date.now() });

      ctx.ui.setStatus("senior-engineer-delegate", `${mode}: ${task.slice(0, 50)}`);
      ctx.ui.notify(`Sub-agent (${mode}) started...`, "info");

      try {
        const output = await runPiWithPrompt(promptPath, mode, ctx.cwd, ctx.signal);
        activeDelegates = activeDelegates.filter((d) => d.id !== delegateId);

        pi.appendEntry("senior-engineer-delegate-result", {
          mode,
          task,
          result: output.slice(0, 2000),
          timestamp: Date.now(),
        });

        pi.sendMessage({
          customType: "senior-engineer-delegate-result",
          display: true,
          content: [
            `# Sub-agent Result: ${mode}`,
            "",
            `Task: ${task}`,
            "",
            "---",
            "",
            output,
            "",
            "---",
            "",
            "*Sub-agent completed. To delegate another task, use `/delegate <mode> <task>` or the `senior_engineer_delegate_task` tool.*",
          ].join("\n"),
        });

        await ctx.waitForIdle();
        ctx.ui.setStatus("senior-engineer-delegate", undefined);
      } catch (err: any) {
        activeDelegates = activeDelegates.filter((d) => d.id !== delegateId);
        ctx.ui.setStatus("senior-engineer-delegate", undefined);

        if (err.message === "ABORTED") {
          ctx.ui.notify("Sub-agent dibatalkan", "warning");
        } else {
          ctx.ui.notify(`Sub-agent error: ${err.message.slice(0, 100)}`, "error");
        }
      }
    },
  });

  pi.registerTool({
    name: "senior_engineer_delegate_task",
    label: "Delegate a sub-agent task",
    description: "Spawn a focused sub-agent with an isolated context for research, review, refactor, test, analyze, audit, plan, or explain. Provide mode and task description. The sub-agent runs in a separate process and returns the result.",
    parameters: Type.Object({
      mode: Type.Optional(Type.Union([
        Type.Literal("research"),
        Type.Literal("review"),
        Type.Literal("refactor"),
        Type.Literal("test"),
        Type.Literal("analyze"),
        Type.Literal("audit"),
        Type.Literal("plan"),
        Type.Literal("explain"),
      ])),
      task: Type.String({ description: "Task description for the sub-agent. Be specific about what to investigate." }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      const mode: DelegateMode = (params.mode as DelegateMode) || "research";
      const task = (params.task || "").trim();
      if (!task) {
        return { content: [{ type: "text" as const, text: "Error: task is required" }], isError: true };
      }

      const agentPrompt = buildAgentPrompt(mode, task);
      const { dir, promptPath } = tmpDirFor(mode, task);
      writePrompt(agentPrompt, promptPath);

      const delegateId = `delegate-${Date.now()}`;
      const cwd = process.cwd();
      activeDelegates.push({ id: delegateId, mode, task, cwd, tmpDir: dir, startedAt: Date.now() });

      const promptHeader = [
        "━━━ SUB-AGENT PROMPT ━━━",
        `Mode: ${mode}`,
        "─── Task ───",
        task,
        "",
        agentPrompt.slice(0, 2000),
        "━━━ SUB-AGENT OUTPUT ━━━",
      ].join("\n");

      let accumulatedOutput = "";
      onUpdate?.({ content: [{ type: "text" as const, text: promptHeader }] });

      try {
        const output = await runPiWithPrompt(promptPath, mode, cwd, signal, (chunk) => {
          accumulatedOutput += chunk;
          // Keep last 3000 chars for streaming display
          const tail = accumulatedOutput.length > 3000
            ? `...[${accumulatedOutput.length - 3000} chars hidden]...\n${accumulatedOutput.slice(-3000)}`
            : accumulatedOutput;
          onUpdate?.({ content: [{ type: "text" as const, text: `${promptHeader}\n${tail}` }] });
        });
        activeDelegates = activeDelegates.filter((d) => d.id !== delegateId);

        pi.appendEntry("senior-engineer-delegate-result", {
          mode,
          task,
          result: output.slice(0, 2000),
          timestamp: Date.now(),
        });

        return {
          content: [{ type: "text" as const, text: output || "(no output)" }],
          details: { mode, task, pid: process.pid },
        };
      } catch (err: any) {
        activeDelegates = activeDelegates.filter((d) => d.id !== delegateId);
        if (err.message === "ABORTED") {
          return {
            content: [{ type: "text" as const, text: "Sub-agent was cancelled." }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Sub-agent failed: ${err.message}` }],
          isError: true,
        };
      }
    },
  });
}
