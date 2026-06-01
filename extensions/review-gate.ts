/**
 * Senior Engineer Review Gate Extension
 *
 * Commands:
 * - /review_diff
 * - /review_security
 * - /review_ui
 * - /review_api
 * - /review_db
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

function runShell(command: string, cwd = process.cwd()): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd, env: process.env });
    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

async function getGitDiff(): Promise<string> {
  const stat = await runShell("git status --short && printf '\n--- DIFF ---\n' && git diff -- .", process.cwd());
  return stat.output || "No git diff available.";
}

function reviewPrompt(kind: string, diff: string): string {
  const base = [
    `Senior Engineer Review Gate: ${kind}`,
    "",
    "Review the current diff like a strict senior engineer.",
    "Respond in Indonesian.",
    "Do not edit code unless the user explicitly asks after the review.",
    "Give findings with priority P0/P1/P2.",
    "If there is no issue, say so clearly.",
    "",
  ];

  const checks: Record<string, string[]> = {
    diff: [
      "Check correctness, regression risk, missing edge cases, error handling, and maintainability.",
      "Check whether the patch is too broad or touches unrelated files.",
    ],
    security: [
      "Check auth, authorization, validation, secrets, injection, unsafe shell commands, SSRF, XSS, CSRF, and exposed stack traces.",
    ],
    ui: [
      "Check UX, loading state, empty state, error state, responsiveness, accessibility basics, and consistency with design system.",
    ],
    api: [
      "Check API contracts, validation, error responses, status codes, auth middleware, and backward compatibility.",
    ],
    db: [
      "Check schema/migration risk, indexes, query efficiency, transaction safety, N+1 risk, and data loss risk.",
    ],
  };

  return [
    ...base,
    ...(checks[kind] || checks.diff),
    "",
    "Output format:",
    "1. Executive Summary",
    "2. P0 Findings",
    "3. P1 Findings",
    "4. P2 Findings",
    "5. Recommended Patch Plan",
    "6. Test Recommendation",
    "",
    "Current diff:",
    "```diff",
    diff.slice(0, 30000),
    "```",
  ].join("\n");
}

async function sendReview(pi: ExtensionAPI, kind: string) {
  const diff = await getGitDiff();
  const prompt = reviewPrompt(kind, diff);

  pi.sendMessage({
    customType: "senior-engineer-review-gate",
    display: true,
    content: ["# Senior Engineer Review Gate", "", `Mode: ${kind}`, "", "Diff dikirim ke agent untuk direview."].join("\n"),
  });

  pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("review_diff", {
    description: "Review current git diff for correctness and regression risk",
    handler: async () => sendReview(pi, "diff"),
  });

  pi.registerCommand("review_security", {
    description: "Review current git diff for security issues",
    handler: async () => sendReview(pi, "security"),
  });

  pi.registerCommand("review_ui", {
    description: "Review current git diff for UI/UX issues",
    handler: async () => sendReview(pi, "ui"),
  });

  pi.registerCommand("review_api", {
    description: "Review current git diff for API contract and backend issues",
    handler: async () => sendReview(pi, "api"),
  });

  pi.registerCommand("review_db", {
    description: "Review current git diff for database/query/migration risk",
    handler: async () => sendReview(pi, "db"),
  });
}
