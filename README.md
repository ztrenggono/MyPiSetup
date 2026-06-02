# Senior Engineer Pi Agent Setup

Pi AI coding assistant extensions + prompt engineering.
Membuat AI agent bekerja seperti **senior software engineer** — bukan cuma code generator.

## Philosophy

AI agent itu defaultnya **halu**. Dia gas aja nulis kode tanpa ngerti project, tanpa mikir risk,
tanpa test. Ini karena prompt bawaan Pi itu generik — dia nggak tau standard lo.

Setup ini ngubah behavior AI jadi:

1. **Nggak langsung edit** — harus inspect → plan → implement.
2. **Nggak ngaku-ngaku** — kalo belum dites, bilang "belum dites".
3. **Ngerti risk** — security, production readiness, backward compatibility.
4. **Bisa delegate** — tugas berat dikerjain sub-agent di session terpisah (irit token).
5. **Ada memory** — inget konteks project, tech stack, arsitektur persisten.
6. **Ada review gate** — sebelum merge, lewatin code review terstruktur.
7. **Ada workflow** — mode-based (fix, feature, refactor, audit, teach, dll).
8. **Zero extra token burn** — semua operasi memory pake file langsung, tanpa LLM subprocess.
9. **Codex tools optional** — bisa pake exec_command (PTY), apply_patch, image_generation.

## Extension Overview

| Extension | File | Fungsi |
|-----------|------|--------|
| **Senior Engineer Workflow** | `senior-engineer-workflow.ts` | Mode-based dev workflow + decision helper + git checkpoint + `/restore` + ASCII mascot |
| **Project Init** | `project-init.ts` | Generate AGENTS.md dengan senior engineering rules |
| **Task Delegator** | `task-delegator.ts` | Spawn sub-agent terisolasi — research, review, plan, audit |
| **Project Memory v3** | `project-memory.ts` | MemoryStore persistent + correction auto-detection + `/memory-insights` + `memory` tool |
| **Context Pack** | `context-pack.ts` | Generate snapshot file tree + tech stack detection |
| **Docker Runner** | `docker-runner.ts` | Deteksi & jalanin test/lint/build di Docker |
| **Review Gate** | `review-gate.ts` | Code review terstruktur: diff, security, UI, API, DB |
| **Identity Guard** | `zz-identity-guard.ts` | Re-assert Pi identity (berjalan setelah codex-conversion) |

### Optional: Codex Tools (via npm)

| Tool | Sumber | Fungsi |
|------|--------|--------|
| `exec_command` | `@howaboua/pi-codex-conversion` | Shell PTY session — interactive, stateful |
| `write_stdin` | `@howaboua/pi-codex-conversion` | Kirim input ke session berjalan |
| `apply_patch` | `@howaboua/pi-codex-conversion` | Patch-based edit (batch multi-file) |
| `image_generation` | `@howaboua/pi-codex-conversion` | Generate gambar via OpenAI Responses API |
| `view_image` | `@howaboua/pi-codex-conversion` | Baca file gambar |

## Architecture

```
System Prompt build order (berurutan):
1. project-memory.ts      → inject memory entries (structured + auto-learned)
2. senior-engineer-workflow.ts → inject persona + workflow instructions (TOP)
3. (npm) pi-codex-conversion   → inject exec_command, apply_patch, dll + guidelines
4. zz-identity-guard.ts   → re-assert "You are Pi. NOT Codex." (BOTTOM, recency effect)

Memory flow:
┌─ Session ─────────────────────────────────────────┐
│  memory tool (explicit AI call) → fs.writeFile     │
│  atau correction (regex auto) → fs.writeFile       │
│  → next session: before_agent_start inject isi file │
└────────────────────────────────────────────────────┘

Git checkpoint flow:
before write mode (fix/feature/refactor/test):
  git add -A && git commit -m "checkpoint: before /workflow ..."
  (/restore = git reset --hard <checkpoint_hash>)
```

## Installation

```bash
# One-command install
./install.sh
```

Script akan:
- Backup extension existing ke `backup-<timestamp>/`
- Copy semua extension ke `~/.pi/agent/extensions/`
- Kasih tau next steps

Atau manual:

```bash
# Copy semua extension
cp extensions/*.ts ~/.pi/agent/extensions/

# Install Codex tools (opsional)
pi install npm:@howaboua/pi-codex-conversion

# Init AGENTS.md di project lo
# Buka Pi, ketik:
/init
```

## File Structure

```
myPiSetup/
├── README.md                  ← ini
├── install.sh                 ← one-command install
├── AGENTS.md                  ← template senior engineering prompt
├── extensions/
│   ├── senior-engineer-workflow.ts   ← core workflow
│   ├── project-init.ts               ← AGENTS.md generator
│   ├── task-delegator.ts             ← sub-agent spawner
│   ├── project-memory.ts             ← persistent memory v3
│   ├── context-pack.ts               ← file tree snapshot
│   ├── docker-runner.ts              ← test in Docker
│   ├── review-gate.ts                ← structured review
│   └── zz-identity-guard.ts          ← identity guard (loads last)
└── guides/
    ├── 01-senior-engineer-workflow.md
    ├── 02-project-init.md
    ├── 03-task-delegator.md
    ├── 04-project-memory.md
    ├── 05-context-pack.md
    ├── 06-docker-runner.md
    └── 07-review-gate.md
```

## Identity

AI identity di-paksa jadi **Pi** di 2 titik:
- **Top** (dari `senior-engineer-workflow.ts`): "You are Pi, NOT Codex"
- **Bottom** (dari `zz-identity-guard.ts`): "FINAL IDENTITY CONFIRMATION: You are Pi"

Ini mencegah model GPT/Codex ngaku "I'm Codex" saat ada Codex tools.

Respond `who are you` → "Saya adalah Pi, seorang AI senior software engineer."

## Memory System

Ada 2 jenis memory yang di-inject tiap session start:

### 1. Structured 7-Section (project-specific)
Disimpan di `~/.pi/agent/memories/senior-engineer-workflow/projects/<slug>.md`:
- Project, Understanding, Tech Stack, Architecture, Commands, Risks/TODO, Task History

### 2. Auto-learned (cross-session)
Disimpan di `~/.pi/agent/pi-hermes-memory/` — 3 file:
- `MEMORY.md` — global facts & conventions
- `USER.md` — user preferences
- `failures.md` — correction history (7-day TTL)

### Cara Simpan Memory

| Method | Trigger | Token Cost |
|--------|---------|-----------|
| `memory` tool (AI-callable) | AI/tool panggil explicit | **0** (fs.write) |
| `/memory_update <note>` | User command | **0** |
| Correction auto-detect | Regex detect pola koreksi di chat | **0** (pattern only) |
| `/memory-insights` | Lihat semua memory | **0** |
| `/memory-consolidate [keep=N]` | Prune old entries | **0** |

Zero extra LLM calls — semua operasi file langsung.

## All Commands

### Workflow
```bash
/workflow <mode> "<task>"       # Start workflow mode
/workflow_status                # Cek status
/workflow_cancel                # Cancel
/restore                        # Rollback checkpoint
```

### Modes
| Mode | Read-Only? | Use Case |
|------|-----------|----------|
| `teach` | ✅ | Project baru — AI inspect & simpen memory |
| `plan` | ✅ | Greenfield planning |
| `fix` | ❌ | Bug fix minimal |
| `feature` | ❌ | Fitur baru |
| `refactor` | ❌ | Refactor |
| `audit` | ✅ | Full code audit |
| `production` | ✅ | Production readiness |
| `test` | ❌ | Nambah test |
| `memory` | ✅ | Update manual |
| `default` | ❌ | General |

### Memory
```bash
/memory_show                    # Lihat structured project memory
/memory_update "<note>"          # Append note ke memory
/memory-insights                # Lihat auto-learned memory + failures
/memory-consolidate [keep=10]   # Prune old entries (keep N terbaru)
/memory_path                    # Path file memory
```

### Context
```bash
/context_index                  # Generate context pack
/context_show                   # Lihat context pack
/context_focus <keyword>        # Cari file
```

### Delegate
```bash
/delegate research "<task>"     # Riset
/delegate review "<file>"       # Review
/delegate audit "<area>"        # Audit
/delegate plan "<fitur>"        # Planning
/delegate refactor "<file>"     # Refactor analysis
/delegate test "<module>"       # Test planning
/delegate analyze "<path>"      # Code quality
/delegate explain "<code>"      # Explain
```

### Test
```bash
/test_detect                    # Deteksi test/lint/build command
/test_run "<command>"           # Jalanin (prioritas Docker)
```

### Review
```bash
/review_diff                    # Code diff review
/review_security                # Security review
/review_ui                      # UI review
/review_api                     # API contract review
/review_db                      # DB migration review
```

### Codex Tools (jika terinstall)
```bash
/codex all                      # Aktifkan adapter di semua model
/codex status                   # Toggle statusline
/codex search                   # Toggle web search
/codex image                    # Toggle image generation
/codex usage                    # Usage info
/codex fast                     # Priority tier
/codex low|medium|high          # Verbosity
```

### Init
```bash
/init                           # Generate AGENTS.md
```

## Use Cases

### Scenario 1: Project Baru
```bash
/workflow teach                 # AI baca docs/PRD, simpen memory
/init                           # Generate AGENTS.md
/context_index                  # Snapshot file tree
/delegate plan "Buat arsitektur"
/workflow feature "setup awal"
```

### Scenario 2: Project Besar
```bash
/workflow teach                 # AI inspect seluruh project
/init                           # Generate AGENTS.md
/context_index                  # Snapshot
/memory-insights                # Cek apa yang disimpen
/workflow fix "bug payment"
```

### Scenario 3: Refactor
```bash
/delegate audit "Analisis code quality di payment module"
/workflow refactor "pisahin business logic dari controller"
/test_detect && /test_run "npm test"
/review_diff
```

### Scenario 4: Debug
```bash
/delegate research "Penyebab error 500 di Express validation"
/workflow fix "tombol register error 500 pas input email kosong"
```

## Key Design Decisions

1. **Zero token burn** — semua memory pakai file langsung, gak ada `pi -p` subprocess. Irit token.
2. **Identity guard** — file `zz-` biar load terakhir, override identity setelah codex-conversion.
3. **Git checkpoint** — sebelum write mode, auto commit checkpoint. Bisa rollback via `/restore`.
4. **Decision helper** — kalo ambiguous, AI wajib present 3-5 numbered options dengan ⭐ Recommended.
5. **Indonesian output** — semua output bahasa Indonesia.
6. **Small Patch Mode** — max 3-7 files per task, gak boleh refactor total dalam 1 commit.

## Deterministic Check

Setup ini certified:
- **Identity**: `who are you` → "Saya adalah Pi, seorang AI senior software engineer."
- **Memory**: `/memory-insights` → show stored memory
- **Checkpoint**: `/restore` → rollback ke checkpoint
- **Decision**: kalo ambiguous → present options with ⭐

---
*Setup by [ztrenggono](https://github.com/ztrenggono)*
