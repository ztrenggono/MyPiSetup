/**
 * Senior Engineer Workflow Extension v2
 *
 * Commands:
 * - /workflow [teach|audit|production|fix|feature|refactor|test|memory] [request]
 * - /workflow_status
 * - /workflow_cancel
 * - /workflow_continue
 * - /workflow_checkpoint
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const MEMORY_ROOT = path.join(os.homedir(), ".pi", "agent", "memories", "senior-engineer-workflow", "projects");
const CHECKPOINT_ROOT = path.join(os.homedir(), ".pi", "agent", "checkpoints", "senior-engineer-workflow");

type WorkflowMode = "default" | "teach" | "audit" | "production" | "fix" | "feature" | "refactor" | "test" | "memory" | "plan";
type WorkflowStage = "understand" | "plan" | "implement" | "test" | "review" | "fix" | "verify" | "memory" | "done";

interface WorkflowState {
  active: boolean;
  mode: WorkflowMode;
  stage: WorkflowStage;
  projectPath: string;
  memoryFile: string;
  request: string;
  iteration: number;
  maxIterations: number;
  readOnly: boolean;
  testsPassed: boolean;
  reviewIssues: string[];
}

function slugifyProjectPath(projectPath: string): string {
  return projectPath
    .replace(os.homedir(), "home")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function ensureMemoryFile(projectPath: string): Promise<string> {
  await fs.mkdir(MEMORY_ROOT, { recursive: true });
  const file = path.join(MEMORY_ROOT, `${slugifyProjectPath(projectPath)}.md`);
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(
      file,
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
  return file;
}

async function updateMemorySection(memoryFile: string, section: string, content: string): Promise<void> {
  const file = await fs.readFile(memoryFile, "utf-8");
  const sectionHeader = `## ${section}`;
  const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHeader}\\n\\n)(?:.|\\n)*?(?=\\n## |\\n$)`);

  let updated: string;
  if (regex.test(file)) {
    updated = file.replace(regex, `$1${content.trim()}`);
  } else {
    updated = file.trimEnd() + `\n\n${sectionHeader}\n\n${content.trim()}\n`;
  }
  await fs.writeFile(memoryFile, updated, "utf-8");
}

async function readFileSafe(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return "";
  }
}

async function appendMemory(memoryFile: string, title: string, body: string): Promise<void> {
  await fs.appendFile(
    memoryFile,
    ["", "---", "", `## ${new Date().toISOString()} - ${title}`, "", body.trim(), ""].join("\n"),
    "utf-8"
  );
}

function parseArgs(args: string): { mode: WorkflowMode; request: string; readOnly: boolean } {
  const trimmed = (args || "").trim();
  if (!trimmed) return { mode: "default", request: "", readOnly: false };

  const [first, ...rest] = trimmed.split(/\s+/);
  const modes: WorkflowMode[] = ["teach", "audit", "production", "fix", "feature", "refactor", "test", "memory", "plan"];
  if (modes.includes(first as WorkflowMode)) {
    const mode = first as WorkflowMode;
    return { mode, request: rest.join(" ").trim(), readOnly: ["teach", "audit", "production", "memory", "plan"].includes(mode) };
  }
  return { mode: "default", request: trimmed, readOnly: false };
}

function baseInstruction(state: WorkflowState, memoryPreview: string): string {
  return [
    "You are using Senior Engineer Workflow Extension v2.",
    "Respond in Indonesian.",
    "You are a senior software engineer.",
    "Do not edit code before understanding the project and writing a plan.",
    "Use Small Patch Mode: maximum 3 to 7 files for a small task.",
    "Do not change tech stack without approval.",
    "Do not delete existing logic without clear reason.",
    "Run or recommend tests after changes.",
    "Update project memory after meaningful work.",
    "Never store secrets in memory.",
    "",
    `Mode: ${state.mode}`,
    `Project: ${state.projectPath}`,
    `Memory file: ${state.memoryFile}`,
    `Read-only: ${state.readOnly ? "yes" : "no"}`,
    "",
    "Project memory preview:",
    "```md",
    memoryPreview.slice(0, 5000) || "No memory yet.",
    "```",
    "",
    "Before any edit, write:",
    "1. Understanding",
    "2. Project Context",
    "3. Files To Inspect or Change",
    "4. Implementation Plan",
    "5. Risk Analysis",
    "6. Test Plan",
    "",
  ].join("\n");
}

function modeInstruction(state: WorkflowState, memoryPreview: string): string {
  const base = baseInstruction(state, memoryPreview);
  const request = state.request || "No additional request provided.";

  if (state.mode === "teach") {
    return [
      base,
      "Mode: TEACH",
      "Do not edit application code.",
      "DELEGATE exploration to `senior_engineer_delegate_task` — spawn sub-agents to read different parts of the project in parallel.",
      "Example: delegate one sub-agent to read tech stack, another to read routes/API, another to read database schema.",
      "Collect all results and update each memory section using `senior_engineer_workflow_memory_update`.",
      "Call the tool separately for each section: Understanding, Tech Stack, Architecture, Commands, Risks.",
      "Also append a task history entry using `senior_engineer_workflow_memory_append`.",
      "Output sections: Project Understanding, Tech Stack, Architecture, Main Modules, User Flows, API or Routes, Database or Storage, Build and Test Commands, Deployment Notes, Known Risks, Memory Updated.",
    ].join("\n");
  }

  if (state.mode === "audit") {
    return [
      base,
      "Mode: AUDIT",
      "Read-only mode. Do not edit code.",
      "Audit pages, buttons, forms, API endpoints, frontend-to-backend flow, auth, authorization, validation, error handling, loading state, empty state, UI/UX, responsiveness, fake/pajangan features, and dead code.",
      "Use P0/P1/P2 priorities.",
      "Required sections: Executive Summary, Project Understanding, Architecture Summary, Feature Inventory, Button or Interaction Audit, API Audit, UI/UX Audit, Security Findings, Bugs/Fake Features/Dead Code, P0, P1, P2, Recommended Fix Plan, Memory Updated.",
    ].join("\n");
  }

  if (state.mode === "production") {
    return [
      base,
      "Mode: PRODUCTION READINESS",
      "Read-only mode. Do not edit code.",
      "Check security, auth, authorization, API validation, error handling, logging, monitoring, DB query/indexing, Docker/deployment, env handling, performance, UI/UX, mobile responsiveness, maintainability, scalability, backup/recovery, CI/CD.",
      "Required sections: 1 Executive Summary, 2 Production Readiness Score, 3 Critical Blockers, 4 P0 Fixes, 5 P1 Improvements, 6 P2 Polish, 7 Deployment Recommendation, 8 Final Verdict, 9 Memory Updated.",
      "Verdict must be Ready, Not Ready, or Ready with conditions.",
    ].join("\n");
  }

  if (state.mode === "plan") {
    return [
      base,
      "Mode: PLAN",
      "Read-only. Only create or update PLAN.md. Do NOT edit any application code.",
      "This project is greenfield — there are only docs (PRD, tech spec, requirements, Notion exports), no application code yet.",
      "DELEGATE research to `senior_engineer_delegate_task` to read docs in parallel (one sub-agent per doc or per area).",
      "Collect all delegate results, then create PLAN.md at project root with:",
      "",
      "## PLAN.md Structure",
      "",
      "1. **Project Overview** — what we're building, from docs",
      "2. **Tech Stack Decisions** — framework, database, infra, with rationale",
      "3. **Architecture Overview** — high-level system design",
      "4. **Phases** — numbered, each with:",
      "   - Goal (what this phase delivers)",
      "   - Files/areas involved",
      "   - Dependencies on previous phases",
      "   - Acceptance criteria",
      "5. **Milestones** — key delivery dates or checkpoints",
      "6. **Risks & Mitigations**",
      "",
      "Rules:",
      "- Phases must be small enough to execute via /workflow feature individually (1-5 files per phase).",
      "- First phase must be project scaffold + database schema + CI.",
      "- Each phase must deliver something testable/demoable.",
      "- Include all git commands for initializing the project.",
      "- Write PLAN.md, then update project memory with understanding + plan summary.",
      "",
    ].join("\n");
  }

  if (state.mode === "fix") {
      "Find root cause first.",
      "BEFORE reading any files yourself, DELEGATE research to `senior_engineer_delegate_task` — the sub-agent will read files, trace code, and return findings.",
      "Use the delegate result as your understanding, then write Root Cause Hypothesis, Files To Inspect, Fix Plan, Risk Analysis, Test Plan.",
      "This keeps your context focused on editing, not on reading.",
      "Patch only necessary files. Verify and update memory.",
    ].join("\n");
  }

  if (state.mode === "feature") {
    return [
      base,
      "Mode: FEATURE",
      `Feature/request: ${request}`,
      "DELEGATE research to `senior_engineer_delegate_task` first to inspect existing patterns and identify frontend/backend/database impact.",
      "Use the delegate result to write your plan.",
      "Plan first. Keep patch small. Add validation and error handling. Add/update tests if possible. Explain migrations or breaking changes first.",
    ].join("\n");
  }

  if (state.mode === "refactor") {
    return [base, "Mode: REFACTOR", `Request: ${request}`, "DELEGATE refactor analysis to `senior_engineer_delegate_task` first — the sub-agent analyzes code structure and proposes strategy. Use the result to plan your changes. Improve structure without behavior change. Do not change API contracts or schema unless requested. Keep patch small and test."].join("\n");
  }

  if (state.mode === "test") {
    return [base, "Mode: TEST", "Detect available test commands. Run or recommend tests. Summarize failures and propose coverage improvements."].join("\n");
  }

  if (state.mode === "memory") {
    return [base, "Mode: MEMORY", "Read current memory, summarize what is known, show missing context, and update memory if user provides new context. Never store secrets."].join("\n");
  }

  return [base, "Mode: DEFAULT", `Request: ${request}`, "Infer the safest workflow and proceed with understanding and plan first."].join("\n");
}

export default function (pi: ExtensionAPI) {
  let workflow: WorkflowState | null = null;

  const updateStatus = (ctx: any) => {
    if (workflow?.active) {
      ctx.ui.setStatus("senior-engineer-workflow", `${workflow.mode}:${workflow.stage} (${workflow.iteration}/${workflow.maxIterations})`);
      pi.appendEntry("senior-engineer-workflow-state", workflow);
    } else {
      ctx.ui.setStatus("senior-engineer-workflow", undefined);
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    workflow = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === "senior-engineer-workflow-state") {
        workflow = entry.data as WorkflowState;
      }
    }
    if (workflow?.active) updateStatus(ctx);
  });

  pi.registerCommand("workflow", {
    description: "Senior Engineer workflow. Usage: /workflow [teach|audit|production|fix|feature|refactor|test|memory] [request]",
    handler: async (args, ctx) => {
      const projectPath = process.cwd();
      const parsed = parseArgs(args || "");
      const memoryFile = await ensureMemoryFile(projectPath);
      const memoryPreview = await readFileSafe(memoryFile);

      workflow = {
        active: true,
        mode: parsed.mode,
        stage: "understand",
        projectPath,
        memoryFile,
        request: parsed.request,
        iteration: 0,
        maxIterations: parsed.readOnly ? 4 : 12,
        readOnly: parsed.readOnly,
        testsPassed: false,
        reviewIssues: [],
      };

      updateStatus(ctx);

      pi.sendMessage({
        customType: "senior-engineer-workflow",
        display: true,
        content: [
          "# Senior Engineer Workflow Started",
          "",
          `Mode: ${workflow.mode}`,
          `Project: ${workflow.projectPath}`,
          `Memory: ${workflow.memoryFile}`,
          `Read-only: ${workflow.readOnly ? "yes" : "no"}`,
          "",
          `Request: ${workflow.request || "-"}`,
        ].join("\n"),
      });

      pi.sendUserMessage(modeInstruction(workflow, memoryPreview), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("workflow_status", {
    description: "Show current Senior Engineer workflow status",
    handler: async (_args, ctx) => {
      if (!workflow?.active) {
        ctx.ui.notify("No active Senior Engineer workflow", "info");
        return;
      }
      pi.sendMessage({
        customType: "senior-engineer-workflow",
        display: true,
        content: [
          "# Senior Engineer Workflow Status",
          "",
          `Mode: ${workflow.mode}`,
          `Stage: ${workflow.stage}`,
          `Iteration: ${workflow.iteration}/${workflow.maxIterations}`,
          `Project: ${workflow.projectPath}`,
          `Memory: ${workflow.memoryFile}`,
          `Read-only: ${workflow.readOnly ? "yes" : "no"}`,
          `Tests Passed: ${workflow.testsPassed ? "yes" : "no"}`,
          `Review Issues: ${workflow.reviewIssues.length}`,
        ].join("\n"),
      });
    },
  });

  pi.registerCommand("workflow_cancel", {
    description: "Cancel active Senior Engineer workflow",
    handler: async (_args, ctx) => {
      if (!workflow?.active) {
        ctx.ui.notify("No active Senior Engineer workflow", "info");
        return;
      }
      workflow.active = false;
      updateStatus(ctx);
      workflow = null;
      ctx.ui.notify("Senior Engineer workflow cancelled", "info");
    },
  });

  pi.registerCommand("workflow_checkpoint", {
    description: "Save a manual checkpoint note for current workflow/project",
    handler: async (args, ctx) => {
      const projectPath = process.cwd();
      await fs.mkdir(CHECKPOINT_ROOT, { recursive: true });
      const file = path.join(CHECKPOINT_ROOT, `${slugifyProjectPath(projectPath)}-${Date.now()}.md`);
      await fs.writeFile(
        file,
        ["# Senior Engineer Workflow Checkpoint", "", `Project: ${projectPath}`, `Time: ${new Date().toISOString()}`, "", args || "No note"].join("\n"),
        "utf-8"
      );
      ctx.ui.notify("Checkpoint saved", "info");
      pi.sendMessage({ customType: "senior-engineer-workflow", display: true, content: `Checkpoint saved:\n\n${file}` });
    },
  });

  pi.registerTool({
    name: "senior_engineer_workflow_memory_append",
    label: "Append Senior Engineer Workflow Memory",
    description: "Append a task history entry to project memory. Never store secrets.",
    parameters: Type.Object({
      title: Type.String(),
      body: Type.String(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const projectPath = workflow?.projectPath || process.cwd();
      const memoryFile = workflow?.memoryFile || (await ensureMemoryFile(projectPath));
      await appendMemory(memoryFile, params.title, params.body);
      return { content: [{ type: "text", text: `Memory updated: ${memoryFile}` }], details: { memoryFile } };
    },
  });

  pi.registerTool({
    name: "senior_engineer_workflow_memory_update",
    label: "Update Memory Section",
    description: "Update a specific section of project memory (Understanding, Tech Stack, Architecture, Commands, or Risks). Use this to replace 'Unknown yet.' with real project context. Never store secrets.",
    parameters: Type.Object({
      section: Type.String(),
      content: Type.String(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const projectPath = workflow?.projectPath || process.cwd();
      const memoryFile = workflow?.memoryFile || (await ensureMemoryFile(projectPath));
      await updateMemorySection(memoryFile, params.section, params.content);
      return { content: [{ type: "text", text: `Memory section "${params.section}" updated: ${memoryFile}` }], details: { memoryFile } };
    },
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!workflow?.active) return {};
    const guidance = [
      "",
      "---",
      "SENIOR ENGINEER WORKFLOW ACTIVE",
      `Mode: ${workflow.mode}`,
      `Stage: ${workflow.stage}`,
      `Project: ${workflow.projectPath}`,
      `Memory: ${workflow.memoryFile}`,
      `Read-only: ${workflow.readOnly ? "yes" : "no"}`,
      "Follow: understand -> plan -> small patch -> test -> review -> memory.",
      "Never store secrets.",
      "---",
    ].join("\n");
    return { systemPrompt: event.systemPrompt + guidance };
  });
}
