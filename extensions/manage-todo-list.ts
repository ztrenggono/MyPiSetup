import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import type { AgentToolResult, AgentToolUpdateCallback, Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";

// ─── Types ───

type TodoStatus = "not-started" | "in-progress" | "completed";

interface TodoItem {
  id: number;
  title: string;
  description: string;
  status: TodoStatus;
}

interface TodoDetails {
  operation: "read" | "write";
  todos: TodoItem[];
  error?: string;
}

interface TodoStats {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

// ─── Schema ───

const TodoItemSchema = Type.Object({
  id: Type.Number({ description: "Sequential ID starting from 1." }),
  title: Type.String({ description: "Action-oriented label (3-7 words)." }),
  description: Type.String({ description: "Context, requirements, or notes." }),
  status: StringEnum(["not-started", "in-progress", "completed"] as const),
});

const ManageTodoListParams = Type.Object({
  operation: StringEnum(["write", "read"] as const, {
    description: "write: Ganti seluruh list. read: Lihat list saat ini.",
  }),
  todoList: Type.Optional(Type.Array(TodoItemSchema)),
});

type ManageTodoListInput = Static<typeof ManageTodoListParams>;

// ─── State Manager ───

class TodoState {
  private todos: TodoItem[] = [];

  read() { return [...this.todos]; }
  write(todos: TodoItem[]) { this.todos = todos.map(t => ({ ...t })); }
  clear() { this.todos = []; }

  getStats(): TodoStats {
    return {
      total: this.todos.length,
      completed: this.todos.filter(t => t.status === "completed").length,
      inProgress: this.todos.filter(t => t.status === "in-progress").length,
      notStarted: this.todos.filter(t => t.status === "not-started").length,
    };
  }

  validate(todos: TodoItem[]): string[] {
    const errors: string[] = [];
    if (!Array.isArray(todos)) return ["todoList harus array"];
    const valid = new Set(["not-started", "in-progress", "completed"]);
    todos.forEach((item, i) => {
      const p = `Item ${i + 1}`;
      if (item.id == null || typeof item.id !== "number") errors.push(`${p}: id wajib (number)`);
      if (!item.title?.trim()) errors.push(`${p}: title wajib`);
      if (!item.description?.trim()) errors.push(`${p}: description wajib`);
      if (!item.status || !valid.has(item.status)) errors.push(`${p}: status invalid`);
    });
    return errors;
  }

  loadFromSession(ctx: ExtensionContext) {
    this.todos = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "manage_todo_list") continue;
      const details = msg.details as TodoDetails | undefined;
      if (details?.todos) this.todos = details.todos.map(t => ({ ...t }));
    }
  }
}

// ─── Widget ───

const WIDGET = "todo-list";

function updateWidget(state: TodoState, ctx: ExtensionContext) {
  const todos = state.read();
  if (todos.length === 0) { ctx.ui.setWidget(WIDGET, undefined); return; }
  const stats = state.getStats();
  ctx.ui.setWidget(WIDGET, (_tui, theme) => ({
    render: (width: number) => {
      const lines: string[] = [];
      lines.push(theme.fg("accent", " Todo List ") + theme.fg("muted", `— ${stats.completed}/${stats.total}`));
      for (const todo of todos) {
        const icon = todo.status === "completed" ? "✓" : todo.status === "in-progress" ? "◉" : "○";
        const c = todo.status === "completed" ? "dim" : todo.status === "in-progress" ? "warning" : "muted";
        const t = todo.status === "completed" ? theme.fg("dim", theme.strikethrough(todo.title))
          : todo.status === "in-progress" ? theme.fg("warning", todo.title) : todo.title;
        lines.push(`  ${theme.fg(c, icon)} ${theme.fg("accent", `${todo.id}.`)} ${t}`);
      }
      return lines.map(l => l.length > width ? l.slice(0, width - 1) + "…" : l);
    },
    invalidate: () => {},
    dispose: () => {},
  }));
}

// ─── Extension ───

export default function (pi: ExtensionAPI) {
  const state = new TodoState();
  let ctxRef: ExtensionContext | undefined;

  const onUpdate = () => { if (ctxRef) updateWidget(state, ctxRef); };

  const restore = (ctx: ExtensionContext) => { ctxRef = ctx; state.loadFromSession(ctx); updateWidget(state, ctx); };
  pi.on("session_start", async (_e, ctx) => restore(ctx));
  pi.on("session_tree", async (_e, ctx) => restore(ctx));
  pi.on("turn_start", async (_e, ctx) => { ctxRef = ctx; });
  pi.on("turn_end", async (_e, ctx) => { ctxRef = ctx; updateWidget(state, ctx); });

  // ─── Tool ───

  pi.registerTool({
    name: "manage_todo_list",
    label: "Todo List",
    description: `Atur todo list untuk tracking progress. GAKUSA pake tool kalo cuma task sepele.

CRITICAL workflow: plan → write → mark in-progress → kerja → mark completed.

Status: not-started (belum mulai), in-progress (lagi dikerjain), completed (selesai).`,
    parameters: ManageTodoListParams,

    async execute(_id: string, params: ManageTodoListInput, _sig, _upd, _ctx) {
      if (params.operation === "read") {
        const todos = state.read();
        return {
          content: [{ type: "text" as const, text: todos.length ? JSON.stringify(todos, null, 2) : "Belum ada todos. Pakai write dulu." }],
          details: { operation: "read", todos } as TodoDetails,
        };
      }

      const todoList = params.todoList;
      if (!todoList || !Array.isArray(todoList)) {
        return { content: [{ type: "text" as const, text: "Error: todoList wajib untuk write." }], details: { operation: "write", todos: state.read(), error: "todoList required" } as TodoDetails, isError: true };
      }

      const errors = state.validate(todoList);
      if (errors.length) {
        return { content: [{ type: "text" as const, text: `Validasi gagal:\n${errors.map(e => `  - ${e}`).join("\n")}` }], details: { operation: "write", todos: state.read(), error: errors.join("; ") } as TodoDetails, isError: true };
      }

      state.write(todoList);
      onUpdate();
      const stats = state.getStats();
      let msg = `Todos udah diupdate. ${stats.completed}/${stats.total} selesai. Lanjut kerjain yang belum.`;
      if (todoList.length < 3) msg += `\n\nWarning: Todo list kecil (<3). Mungkin gak perlu todo list.`;
      return { content: [{ type: "text" as const, text: msg }], details: { operation: "write", todos: state.read() } as TodoDetails };
    },

    renderCall(args: ManageTodoListInput, theme: Theme) {
      let t = theme.fg("toolTitle", theme.bold("manage_todo_list ")) + theme.fg("muted", args.operation);
      if (args.operation === "write" && args.todoList) t += theme.fg("dim", ` (${args.todoList.length} item)`);
      return new Text(t, 0, 0);
    },

    renderResult(result: AgentToolResult<TodoDetails | undefined>, { expanded }: ToolRenderResultOptions, theme: Theme) {
      const d = result.details;
      if (!d) return new Text("text" in result.content[0] ? result.content[0].text : "", 0, 0);
      if (d.error) return new Text(theme.fg("error", `✗ ${d.error}`), 0, 0);
      const done = d.todos.filter(t => t.status === "completed").length;
      if (d.todos.length === 0) return new Text(theme.fg("dim", "Kosong"), 0, 0);
      let t = theme.fg("success", "✓ ") + theme.fg("muted", `${done}/${d.todos.length} selesai`);
      if (expanded) for (const todo of d.todos) {
        const icon = todo.status === "completed" ? "✓" : todo.status === "in-progress" ? "◉" : "○";
        const c = todo.status === "completed" ? "dim" : todo.status === "in-progress" ? "warning" : "dim";
        t += `\n  ${theme.fg(c, icon)} ${theme.fg("accent", `${todo.id}.`)} ${theme.fg(c, todo.title)}`;
      }
      return new Text(t, 0, 0);
    },
  });

  // ─── Commands ───

  pi.registerCommand("todos", {
    description: "Toggle widget / lihat stats (/todos clear untuk hapus)",
    handler: async (args, ctx) => {
      ctxRef = ctx;
      if (args?.trim().toLowerCase() === "clear") { state.clear(); ctx.ui.setWidget(WIDGET, undefined); ctx.ui.notify("Todos dihapus.", "info"); return; }
      const todos = state.read();
      if (!todos.length) { ctx.ui.notify("Belum ada todos. AI bakal bikin pas kerja complex.", "info"); return; }
      updateWidget(state, ctx);
      ctx.ui.notify(`${state.getStats().completed}/${state.getStats().total} selesai.`, "info");
    },
  });
}
