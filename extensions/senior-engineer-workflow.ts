/**
 * Senior Engineer Workflow Extension v2
 *
 * Commands:
 * - /workflow [teach|audit|production|fix|feature|refactor|test|memory] [request]
 * - /workflow_status
 * - /workflow_cancel
 * - /workflow_continue
 * - /workflow_checkpoint
 * - /restore — revert code ke checkpoint (sebelum /workflow write mode dimulai)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

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
  checkpointHash?: string;
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

function gitCheckpoint(projectPath: string, mode: string): string | null {
  try {
    execSync("git rev-parse --git-dir", { cwd: projectPath, stdio: "pipe" });
    const status = execSync("git status --porcelain", { cwd: projectPath, encoding: "utf-8" }).trim();
    if (!status) return null;
    const hash = execSync("git rev-parse HEAD", { cwd: projectPath, encoding: "utf-8" }).trim();
    const label = `checkpoint: before /workflow ${mode} at ${new Date().toISOString().replace("T", " ").slice(0, 19)}`;
    execSync(`git add -A`, { cwd: projectPath, stdio: "pipe" });
    execSync(`git commit -m "${label}"`, { cwd: projectPath, stdio: "pipe" });
    return hash;
  } catch {
    return null;
  }
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
    "You are Pi, an AI senior software engineer.",
    "Do not edit code before understanding the project and writing a plan.",
    "Use Small Patch Mode: maximum 3 to 7 files for a small task.",
    "Do not change tech stack without approval.",
    "Do not delete existing logic without clear reason.",
    "Run or recommend tests after changes.",
    "Update project memory after meaningful work.",
    "Never store secrets in memory.",
    "",
    "Decision Making:",
    "When you encounter ambiguity or multiple valid approaches, do NOT guess.",
    "Present 3-5 specific options directly in your response with a clear recommendation marked with ⭐ (Recommended).",
    "Use simple numbered list. Example:",
    "  ? Pertanyaan",
    "    1) Opsi A",
    "    2) Opsi B ⭐ (Recommended)",
    "    3) Opsi C",
    "After presenting options, stop and ask the user to pick a number. Wait for their answer before proceeding.",
    "",
    "Persistent Memory (zero token overhead via project-memory extension):",
    "- Use the `memory` tool to save durable facts: add to 'user' (preferences), 'memory' (global facts), 'failure' (what failed).",
    "- Use \"/memory-insights\" to show all stored memory + failures.",
    "- Corrections are auto-detected (regex only, free) and saved as failure entries.",
    "- Structured 7-section memory (Understanding, Tech Stack, etc.) is available in the system prompt.",
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
      "",
      "Persistent Memory from this session:",
      "After completing the teach, use the `memory` tool to save key user preferences and architectural insights:",
      "- Add to 'user' every significant user preference or workflow habit discovered.",
      "- Add to 'memory' key architectural decisions, gotchas, or patterns found.",
      "These will auto-inject in future sessions — no need to re-teach.",
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
      "",
      "Purpose:",
      "Create a complete implementation plan for a greenfield project based only on existing documents.",
      "",
      "Read-only rule:",
      "- Do NOT edit application code.",
      "- Do NOT create scaffold files.",
      "- Do NOT install dependencies.",
      "- Do NOT run generators.",
      "- Only create or update PLAN.md at the project root.",
      "- You may update project memory after PLAN.md is created.",
      "",
      "Project condition:",
      "- This is a greenfield project.",
      "- The repository may only contain documents such as PRD, BRD, tech spec, requirements, Notion exports, meeting notes, diagrams, or markdown files.",
      "- There may be no application code yet.",
      "",
      "Required first step:",
      "1. Read project memory from the current project memory file if available.",
      "2. Inspect the repository tree.",
      "3. Identify all planning documents.",
      "4. Read the most important documents before creating PLAN.md.",
      "5. If many documents exist, delegate document review to `senior_engineer_delegate_task`.",
      "",
      "Delegation rule:",
      "- Use `senior_engineer_delegate_task` when there are multiple docs, large docs, or different planning areas.",
      "- Delegate one sub-agent per document or per area.",
      "- Suggested delegate areas:",
      "  - Product and business requirements",
      "  - User roles and user flows",
      "  - Functional requirements",
      "  - Non-functional requirements",
      "  - Data model and database needs",
      "  - API/backend needs",
      "  - Frontend/UI needs",
      "  - Authentication and authorization",
      "  - Deployment and infrastructure",
      "  - Testing and QA",
      "  - Risks and unknowns",
      "- Collect and reconcile all delegate results before writing PLAN.md.",
      "- If delegate findings conflict, explicitly document the conflict and choose the safest assumption.",
      "",
      "Planning principles:",
      "- Do not invent requirements that are not supported by the docs.",
      "- If a requirement is inferred, label it as `Inferred`.",
      "- If something is unclear, label it as `Open Question`.",
      "- Prioritize building the smallest production-ready foundation first.",
      "- Plan must be executable by `/workflow feature` one phase at a time.",
      "- Each phase must be small, focused, testable, and demoable.",
      "- Avoid huge phases that touch too many unrelated areas.",
      "- Prefer vertical slices over large horizontal layers when possible.",
      "",
      "Mandatory phase rules:",
      "- Phase 0 must be Project Setup and Repository Baseline if the repository is not initialized.",
      "- Phase 1 must include project scaffold, initial database schema, environment strategy, and CI baseline.",
      "- Every phase must have clear acceptance criteria.",
      "- Every phase must define test or verification steps.",
      "- Every phase must mention dependencies on previous phases.",
      "- Every phase must be executable independently with `/workflow feature <phase-name>`.",
      "- A normal phase should target 1 to 5 files when possible.",
      "- A foundation phase may touch more files, but it must be split into sub-tasks.",
      "- Do not include implementation code in PLAN.md.",
      "",
      "PLAN.md must include this structure:",
      "",
      "# PLAN.md",
      "",
      "## 1. Project Overview",
      "- Product name",
      "- What we are building",
      "- Target users",
      "- Main problem solved",
      "- Core value proposition",
      "- Source documents used",
      "",
      "## 2. Requirements Summary",
      "### 2.1 Functional Requirements",
      "- List features supported by the docs.",
      "",
      "### 2.2 Non-Functional Requirements",
      "- Security",
      "- Performance",
      "- Scalability",
      "- Availability",
      "- Maintainability",
      "- Accessibility if relevant",
      "- Compliance/privacy if relevant",
      "",
      "### 2.3 User Roles and Permissions",
      "- Role",
      "- Capabilities",
      "- Restrictions",
      "",
      "### 2.4 User Flows",
      "- Main flow",
      "- Alternative flow",
      "- Error/empty state flow",
      "",
      "## 3. Tech Stack Decisions",
      "- Frontend framework",
      "- Backend framework",
      "- Database",
      "- ORM/query builder if any",
      "- Authentication strategy",
      "- Styling/UI system",
      "- Testing tools",
      "- Deployment target",
      "- Monitoring/logging approach",
      "- Rationale for every major decision",
      "- Alternatives considered if relevant",
      "",
      "## 4. Architecture Overview",
      "- High-level architecture",
      "- Frontend structure",
      "- Backend/API structure",
      "- Database/data model overview",
      "- Authentication and authorization flow",
      "- External integrations",
      "- File/folder structure proposal",
      "- Environment variable strategy",
      "",
      "## 5. Data Model Draft",
      "- Main entities",
      "- Key fields",
      "- Relationships",
      "- Index candidates",
      "- Migration notes",
      "- Open questions about data",
      "",
      "## 6. API / Route Plan",
      "- Route or endpoint",
      "- Method",
      "- Purpose",
      "- Request data",
      "- Response data",
      "- Auth requirement",
      "- Validation requirement",
      "",
      "## 7. Implementation Phases",
      "",
      "For every phase, use this exact format:",
      "",
      "### Phase N — Phase Name",
      "- Goal:",
      "- Why this phase exists:",
      "- Deliverables:",
      "- Files/areas likely involved:",
      "- Dependencies:",
      "- Step-by-step tasks:",
      "- Acceptance criteria:",
      "- Test/verification steps:",
      "- Demo outcome:",
      "- Risks:",
      "- Estimated complexity: Small / Medium / Large",
      "",
      "Required phase categories:",
      "1. Repository baseline and project scaffold",
      "2. Database schema and migration baseline",
      "3. Authentication and authorization foundation",
      "4. Core layout/navigation/UI foundation",
      "5. Core domain feature phase 1",
      "6. Core domain feature phase 2",
      "7. Admin/management features if needed",
      "8. API validation and error handling hardening",
      "9. Testing and QA hardening",
      "10. Observability, logging, and monitoring",
      "11. Docker/deployment preparation",
      "12. Production readiness pass",
      "",
      "## 8. Task Backlog",
      "",
      "Create a backlog table:",
      "",
      "| ID | Task | Phase | Priority | Type | Dependencies | Acceptance Criteria | Suggested Command |",
      "|---|---|---|---|---|---|---|---|",
      "",
      "Priority rules:",
      "- P0 = must be done before the app can run safely",
      "- P1 = required for MVP",
      "- P2 = important improvement",
      "- P3 = nice-to-have",
      "",
      "Type examples:",
      "- setup",
      "- frontend",
      "- backend",
      "- database",
      "- auth",
      "- testing",
      "- devops",
      "- docs",
      "- security",
      "",
      "Suggested command examples:",
      "- `/workflow feature phase-1-project-scaffold`",
      "- `/workflow feature phase-2-auth-foundation`",
      "- `/workflow feature phase-3-core-dashboard`",
      "",
      "## 9. Git and Repository Setup Plan",
      "- Commands to initialize git if needed",
      "- Branching strategy",
      "- Commit convention",
      "- Initial .gitignore recommendation",
      "- Suggested first commits",
      "",
      "Include commands such as:",
      "- `git init`",
      "- `git checkout -b main` or `git branch -M main`",
      "- `git add .`",
      "- `git commit -m \"chore: initial project planning\"`",
      "",
      "Only include commands as instructions. Do not execute them in PLAN mode.",
      "",
      "## 10. Environment and Configuration Plan",
      "- Required environment variables",
      "- .env.example plan",
      "- Local development config",
      "- Production config",
      "- Secret management notes",
      "",
      "Never include real secrets.",
      "",
      "## 11. Testing Strategy",
      "- Unit testing",
      "- Integration testing",
      "- E2E testing if relevant",
      "- API testing",
      "- UI testing",
      "- Manual QA checklist",
      "- Minimum test coverage expectation",
      "",
      "## 12. Deployment and Infrastructure Plan",
      "- Docker strategy",
      "- Compose services if needed",
      "- CI/CD baseline",
      "- Build command",
      "- Start command",
      "- Migration command",
      "- Logging and monitoring",
      "- Backup/recovery notes",
      "",
      "## 13. Risks and Mitigations",
      "",
      "Use table format:",
      "",
      "| Risk | Impact | Likelihood | Mitigation | Owner/Phase |",
      "|---|---|---|---|---|",
      "",
      "## 14. Open Questions",
      "- List unclear requirements.",
      "- Explain why each question matters.",
      "- Suggest safest default assumption.",
      "",
      "## 15. Definition of Done",
      "- Project scaffold builds successfully.",
      "- Database schema is versioned through migrations.",
      "- Auth and authorization are tested.",
      "- Core flows are demoable.",
      "- API validation and error handling are implemented.",
      "- UI handles loading, empty, and error states.",
      "- Tests/build/lint are available.",
      "- Docker/deployment path is documented.",
      "- Production readiness blockers are tracked.",
      "",
      "Final actions:",
      "1. Create or update PLAN.md at the project root.",
      "2. Update project memory with:",
      "   - project understanding",
      "   - tech stack decisions",
      "   - architecture summary",
      "   - phase summary",
      "   - open questions",
      "   - risks",
      "3. Report what docs were read.",
      "4. Report whether delegate agents were used.",
      "5. Report the next recommended command.",
      "",
      "Final response format:",
      "",
      "## Summary",
      "## Documents Read",
      "## Delegates Used",
      "## PLAN.md Created/Updated",
      "## Key Decisions",
      "## Open Questions",
      "## Risks",
      "## Memory Updated",
      "## Next Recommended Command",
      "",
    ].join("\n");
  }

  if (state.mode === "fix") {
    return [
      base,
      "Mode: FIX",
      `Bug/request: ${request}`,
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

      if (!parsed.readOnly) {
        const checkpoint = gitCheckpoint(projectPath, parsed.mode);
        if (checkpoint) {
          workflow.checkpointHash = checkpoint;
        }
      }

      updateStatus(ctx);

      const modeIcon: Record<string, string> = {
        teach: "📖", audit: "🔍", production: "🚀", fix: "🔧",
        feature: "✨", refactor: "♻️", test: "🧪", memory: "🧠", plan: "📋", default: "⚡",
      };
      pi.sendMessage({
        customType: "senior-engineer-workflow",
        display: true,
        content: [
          `┏${"━".repeat(60)}┓`,
          "┃" + "".padStart(60) + "┃",
          "┃" + "          ╭──────────────────────╮".padEnd(61) + "┃",
          "┃" + `         │  ${modeIcon[workflow.mode] || "⚡"}  SENIOR ENGINEER  │`.padEnd(61) + "┃",
          "┃" + "          ╰──────────────────────╯".padEnd(61) + "┃",
          "┃" + "".padStart(60) + "┃",
          "┃" + `  Mode      : ${workflow.mode}${"".padStart(Math.max(0, 41 - workflow.mode.length))}┃`,
          "┃" + `  Project   : ${path.basename(workflow.projectPath)}${"".padStart(Math.max(0, 41 - path.basename(workflow.projectPath).length))}┃`,
          "┃" + `  Read-only : ${workflow.readOnly ? "yes" : "no"}${"".padStart(40)}┃`,
          ...(workflow.checkpointHash ? [`┃  Checkpoint: ${workflow.checkpointHash.slice(0, 7)}${"".padStart(39)}┃`] : []),
          "┃" + "".padStart(60) + "┃",
          `┗${"━".repeat(60)}┛`,
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

  pi.registerCommand("restore", {
    description: "Revert code ke checkpoint terakhir sebelum /workflow. Hati-hati: semua perubahan setelah checkpoint akan hilang.",
    handler: async (_args, ctx) => {
      if (!workflow?.checkpointHash) {
        ctx.ui.notify("Tidak ada checkpoint tersedia. Hanya tersedia setelah /workflow fix/feature/refactor/test.", "error");
        return;
      }
      const hash = workflow.checkpointHash;
      try {
        execSync(`git reset --hard ${hash}`, { cwd: workflow.projectPath, stdio: "pipe" });
        ctx.ui.notify(`Code di-revert ke checkpoint ${hash.slice(0, 7)}`, "info");
        pi.sendMessage({
          customType: "senior-engineer-workflow",
          display: true,
          content: `Code di-revert ke checkpoint \`${hash}\`. Semua perubahan setelah checkpoint telah dihapus.`,
        });
      } catch {
        ctx.ui.notify("Gagal restore — cek apakah ada konflik git", "error");
      }
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
    const modeIcon: Record<string, string> = {
      teach: "📖", audit: "🔍", production: "🚀", fix: "🔧",
      feature: "✨", refactor: "♻️", test: "🧪", memory: "🧠", plan: "📋", default: "⚡",
    };
    const cp = workflow.checkpointHash ? `\n  Checkpoint: ${workflow.checkpointHash.slice(0, 7)} (use /restore to revert)` : "";
    const guidance = [
      "",
      `┏${"━".repeat(52)}┓`,
      "┃" + "".padStart(52) + "┃",
      "┃" + `  ╭──────────────────────╮${"".padStart(27)}┃`,
      "┃" + `  │  ${modeIcon[workflow.mode] || "⚡"}  ${workflow.mode.toUpperCase().padEnd(8)}         │${"".padStart(27)}┃`,
      "┃" + `  ╰──────────────────────╯${"".padStart(27)}┃`,
      "┃" + "".padStart(52) + "┃",
      "┃" + `  Stage     : ${workflow.stage}${"".padStart(Math.max(0, 35 - workflow.stage.length))}┃`,
      "┃" + `  Read-only : ${workflow.readOnly ? "yes" : "no"}${"".padStart(36)}┃`,
      ...(cp ? [`┃${cp}${"".padStart(51 - cp.length + 1)}┃`] : []),
      "┃" + "".padStart(52) + "┃",
      "┃" + "  understand → plan → patch → test → review → memory".padEnd(51) + "┃",
      "┃" + "  Never store secrets.".padEnd(51) + "┃",
      "┃" + "".padStart(52) + "┃",
      `┗${"━".repeat(52)}┛`,
      "",
    ].join("\n");
    return { systemPrompt: event.systemPrompt + guidance };
  });
}
