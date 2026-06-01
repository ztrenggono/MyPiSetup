/**
 * Senior Engineer Docker Runner Extension
 *
 * Commands:
 * - /test_detect
 * - /test_run [command]
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

async function detectCommands(projectPath = process.cwd()): Promise<string[]> {
  const commands: string[] = [];
  const pkg = await readJson(path.join(projectPath, "package.json"));

  if (pkg?.scripts) {
    if (pkg.scripts.lint) commands.push("npm run lint");
    if (pkg.scripts.typecheck) commands.push("npm run typecheck");
    if (pkg.scripts.test) commands.push("npm test");
    if (pkg.scripts.build) commands.push("npm run build");
  }

  if (await exists(path.join(projectPath, "pnpm-lock.yaml"))) {
    return commands.map((c) => c.replace(/^npm /, "pnpm ").replace("pnpm test", "pnpm test"));
  }

  if (await exists(path.join(projectPath, "yarn.lock"))) {
    return commands.map((c) => c.replace(/^npm /, "yarn ").replace("yarn test", "yarn test"));
  }

  if (await exists(path.join(projectPath, "requirements.txt")) || await exists(path.join(projectPath, "pyproject.toml"))) {
    commands.push("python -m pytest");
  }

  if (await exists(path.join(projectPath, "go.mod"))) {
    commands.push("go test ./...");
  }

  if (await exists(path.join(projectPath, "composer.json"))) {
    commands.push("composer test");
    commands.push("php artisan test");
  }

  return Array.from(new Set(commands));
}

async function hasCompose(projectPath = process.cwd()): Promise<boolean> {
  return (
    (await exists(path.join(projectPath, "docker-compose.yml"))) ||
    (await exists(path.join(projectPath, "docker-compose.yaml"))) ||
    (await exists(path.join(projectPath, "compose.yml"))) ||
    (await exists(path.join(projectPath, "compose.yaml")))
  );
}

function runShell(command: string, cwd = process.cwd()): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd, env: process.env });
    let output = "";

    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

function shellQuote(command: string): string {
  return command.replace(/'/g, `'\\''`);
}

async function defaultDockerCommand(command: string, projectPath = process.cwd()): Promise<string> {
  const pkg = await readJson(path.join(projectPath, "package.json"));
  const hasNode = !!pkg;

  if (await hasCompose(projectPath)) {
    return `docker compose run --rm app sh -lc '${shellQuote(command)}'`;
  }

  if (hasNode) {
    const packageManager = (await exists(path.join(projectPath, "pnpm-lock.yaml")))
      ? "pnpm"
      : (await exists(path.join(projectPath, "yarn.lock")))
      ? "yarn"
      : "npm";

    const installCommand =
      packageManager === "pnpm"
        ? "corepack enable && pnpm install --frozen-lockfile || pnpm install"
        : packageManager === "yarn"
        ? "corepack enable && yarn install --frozen-lockfile || yarn install"
        : "npm ci || npm install";

    return `docker run --rm -v "$PWD":/app -w /app node:22 sh -lc '${shellQuote(`${installCommand} && ${command}`)}'`;
  }

  if (await exists(path.join(projectPath, "requirements.txt")) || await exists(path.join(projectPath, "pyproject.toml"))) {
    return `docker run --rm -v "$PWD":/app -w /app python:3.12 sh -lc '${shellQuote(`pip install -r requirements.txt 2>/dev/null || true; ${command}`)}'`;
  }

  return command;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("test_detect", {
    description: "Detect likely test/lint/build commands for current project",
    handler: async (_args, _ctx) => {
      const commands = await detectCommands();
      const compose = await hasCompose();
      pi.sendMessage({
        customType: "senior-engineer-test-detect",
        display: true,
        content: [
          "# Detected Test / Build Commands",
          "",
          `Docker Compose detected: ${compose ? "yes" : "no"}`,
          "",
          ...(commands.length ? commands.map((c) => `- ${c}`) : ["- No common test commands detected"]),
          "",
          "Use `/test_run <command>` to run one command.",
        ].join("\n"),
      });
    },
  });

  pi.registerCommand("test_run", {
    description: "Run a test/build/lint command, preferring Docker. Usage: /test_run npm run build",
    handler: async (args, ctx) => {
      let command = (args || "").trim();
      if (!command) {
        const detected = await detectCommands();
        command = detected[0] || "";
      }

      if (!command) {
        ctx.ui.notify("Tidak ada command test yang terdeteksi. Jalankan manual atau kasih command.", "warning");
        return;
      }

      const runCommand = await defaultDockerCommand(command);
      ctx.ui.setStatus("senior-engineer-test", `Running: ${command}`);
      const result = await runShell(runCommand);
      ctx.ui.setStatus("senior-engineer-test", undefined);

      pi.sendMessage({
        customType: "senior-engineer-test-result",
        display: true,
        content: [
          "# Test Result",
          "",
          `Requested command: ${command}`,
          `Executed command: ${runCommand}`,
          `Exit code: ${result.exitCode}`,
          "",
          "## Output",
          "",
          "```txt",
          result.output.slice(-12000),
          "```",
        ].join("\n"),
      });
    },
  });

  pi.registerTool({
    name: "senior_engineer_detect_test_commands",
    label: "Detect Test Commands",
    description: "Detect likely test/lint/build commands for the current project",
    parameters: Type.Object({}),
    async execute() {
      const commands = await detectCommands();
      return {
        content: [{ type: "text", text: commands.join("\n") || "No commands detected" }],
        details: { commands },
      };
    },
  });
}
