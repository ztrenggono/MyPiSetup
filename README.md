# Senior Engineer Pi Agent Setup

Pi AI coding assistant extensions + AGENTS.md prompt engineering.
Membuat AI agent bekerja seperti **senior software engineer** — bukan cuma code generator.

## Philosophy

AI agent itu defaultnya **halu**. Dia gas aja nulis kode tanpa ngerti project, tanpa mikir risk,
tanpa test. Ini karena prompt bawaan Pi itu generik — dia nggak tahu standard lo.

Setup ini ngasih 7 extension dan 1 AGENTS.md yang ngubah behavior AI jadi:

1. **Nggak langsung edit** — harus inspect dulu, baru planning, baru implement.
2. **Nggak ngaku-ngaku** — kalo belum dites, bilang "belum dites".
3. **Ngerti risk** — security, production readiness, backward compatibility.
4. **Bisa delegate** — tugas berat dikerjain sub-agent di session terpisah.
5. **Ada memory** — inget konteks project, tech stack, arsitektur.
6. **Ada review gate** — sebelum merge, lewatin code review dulu.
7. **Ada workflow** — bukan asal ngetik, tapi mode-based (fix, feature, refactor, audit, etc).

## Extension Overview

| Extension | File | Fungsi |
|-----------|------|--------|
| **Senior Engineer Workflow** | `senior-engineer-workflow.ts` | Mode-based development workflow (teach, fix, feature, refactor, audit, production review, test). Track state, inject prompt, checkpoint. |
| **Project Init** | `project-init.ts` | Generate AGENTS.md dengan senior engineering rules + project memory. |
| **Task Delegator** | `task-delegator.ts` | Spawn sub-agent terisolasi untuk research, review, plan, audit — hemat token. |
| **Project Memory** | `project-memory.ts` | Simpen konteks project (tech stack, architecture, commands, risks) ke file markdown. |
| **Context Pack** | `context-pack.ts` | Generate snapshot konteks project (file tree, tech stack, route hints). |
| **Docker Runner** | `docker-runner.ts` | Deteksi & jalanin test/lint/build command di Docker. |
| **Review Gate** | `review-gate.ts` | Code review structured: diff, security, UI, API, DB. |

## How It Prevents AI Hallucination

AI halu karena dia:

1. **Ngasal nebak arsitektur** — `context-pack.ts` fix ini. Dia generate file tree + deteksi stack.
2. **Ngasal edit tanpa ngerti** — `senior-engineer-workflow.ts` + AGENTS.md fix ini. Wajib inspect-plan-implement.
3. **Lupa konteks project** — `project-memory.ts` fix ini. Dia baca memory tiap session start.
4. **Ngasal ngaku test passed** — `docker-runner.ts` fix ini. Dia harus beneran jalanin command.
5. **Ngasal review sendiri** — `review-gate.ts` fix ini. Review terstruktur, bukan asal liat.
6. **Makan token buat hal sepele** — `task-delegator.ts` fix ini. Sub-agent buat riset, main agent fokus.

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

# Init AGENTS.md di project lo
# Buka Pi, ketik:
/init
```

## File Structure

```
myPiSetup/
├── README.md                  ← ini
├── extensions/                ← copy dari ~/.pi/agent/extensions/
│   ├── senior-engineer-workflow.ts
│   ├── project-init.ts
│   ├── task-delegator.ts
│   ├── project-memory.ts
│   ├── context-pack.ts
│   ├── docker-runner.ts
│   ├── review-gate.ts
│   └── README.md              ← cara install & setup
├── guides/
│   ├── 01-senior-engineer-workflow.md
│   ├── 02-project-init.md
│   ├── 03-task-delegator.md
│   ├── 04-project-memory.md
│   ├── 05-context-pack.md
│   ├── 06-docker-runner.md
│   └── 07-review-gate.md
└── AGENTS.md                  ← template senior engineering prompt
```

## Use Case: Kapan Pakai Apa

### Scenario 1: Project Baru — Udah Ada Docs, Belom Ada Code

Ini situasi greenfield. Lo punya PRD / Notion / Figma tapi belum ada baris kode.

```bash
# 1. Teach dulu — biar AI paham project dari docs yang lo punya
/workflow teach

# 2. Generate AGENTS.md — inject senior engineering rules
/init

# 3. Generate context pack — biar AI tau struktur project
/context_index

# 4. Planning arsitektur (delegate biar hemat token)
/delegate plan "Buat arsitektur untuk project ini berdasarkan docs yang ada"

# 5. Start fitur pertama
/workflow feature "setup project structure + database schema"
```

**Kenapa urutannya gitu?**
- `teach` dulu biar AI baca semua file existing (docs, PRD, dll) dan simpen memory.
- `init` bikin AGENTS.md — ini yang bikin AI kerja seperti senior engineer.
- `context_index` biar AI tau file tree real-time.
- Sisanya tinggal pilih mode sesuai task.

---

### Scenario 2: Udah Punya Project Besar

Lo punya codebase ratusan file, production sudah jalan, tapi AI belum pernah denger project ini.

```bash
# 1. Teach — AI inspect seluruh project
/workflow teach

# 2. Init — bikin AGENTS.md dengan konteks project
/init

# 3. Index context — biar AI tau semua file dan tech stack
/context_index

# 4. Cek memory — pastiin AI paham project
/memory_show

# 5. Lanjut kerja normal
/workflow fix "bug di payment gateway"
# atau
/workflow feature "tambah export CSV"
```

**Tips untuk project besar:**
- Pake `/delegate research` buat riset bagian tertentu aja — jangan suruh AI baca seluruh codebase kalo gak perlu.
- Pake `/context_focus <keyword>` buat cari file relevan tanpa perlu tanya AI.
- Sebelum commit, jalanin `/review_diff` biar ada yang ngecek.

---

### Scenario 3: Mau Refactor Code

```bash
# 1. Audit dulu — biar tau apa yang perlu direfactor
/workflow audit
# atau kalo mau lebih hemat token:
/delegate audit "Analisis code quality di module payment — saran refactor"

# 2. Checkpoint — simpen state sebelum refactor (bisa rollback kalo salah)
/workflow_checkpoint "before payment refactor"

# 3. Jalanin refactor
/workflow refactor "refactor payment module: pisahin business logic dari controller"

# 4. Test — pastiin gak broken
/test_detect
/test_run "npm test"

# 5. Review — cek hasil refactor
/review_diff
```

**Penting:** Jangan langsung `refactor` tanpa `audit` dulu. Audit mode read-only, jadi aman.

---

### Scenario 4: Mau Audit Project

Ada 3 cara audit, tergantung kebutuhan:

| Approach | Command | Cocok Untuk |
|----------|---------|-------------|
| **Workflow audit** (full) | `/workflow audit` | Audit komprehensif — AI baca semua file |
| **Delegate audit** (fokus) | `/delegate audit "Audit security di API routes"` | Audit bagian tertentu, hemat token |
| **Review gate** (diff-based) | `/review_security` + `/review_api` | Audit perubahan yang belum di-commit |

**Workflow audit** bakal ngecek:
- Code quality & consistency
- Error handling
- Security vulnerabilities
- Performance bottlenecks
- Testing coverage
- Production readiness
- Dependency health

**Kapan pake yang mana?**
- Lo mau audit full project → `/workflow audit`
- Lo curiga ada issue di bagian tertentu → `/delegate audit "..."`
- Lo mau cek perubahan sebelum merge → `/review_diff` + `/review_security`

---

### Scenario 5: Fitur Baru

```bash
# 1. Plan dulu lewat delegate (opsional, buat task besar)
/delegate plan "Implementation plan untuk fitur payment integration"

# 2. Implement
/workflow feature "tambah payment gateway Stripe"

# 3. Test
/test_detect
/test_run "npm test"

# 4. Review sebelum merge
/review_diff
/review_security
/review_api
/review_db
```

---

### Scenario 6: Debug / Fix Bug

```bash
/workflow fix "tombol register error 500 pas input email kosong"
```

AI akan otomatis: understand → plan → implement minimal fix → test → report.

Kalo bug-nya rumit dan butuh riset, pake delegate dulu:
```bash
/delegate research "Penyebab umum error 500 di Express.js pas validation"
# setelah dapet hasil, baru:
/workflow fix "..."
```

---

## All Workflow Modes & Kapan Pakainya

| Mode | Read-Only? | Kapan Pakai | Contoh Command |
|------|-----------|-------------|----------------|
| `teach` | ✅ Ya | Project baru pertama kali, atau project besar yang belum pernah dites AI | `/workflow teach` |
| `fix` | ❌ No | Ada bug, perlu fix minimal tanpa ngerusak yang lain | `/workflow fix "login error"` |
| `feature` | ❌ No | Mau nambah fitur baru — AI planning dulu sebelum implement | `/workflow feature "tambah halaman profile"` |
| `refactor` | ❌ No | Mau refactor — AI analisis risk dulu sebelum ubah code | `/workflow refactor "pisahin concern"` |
| `audit` | ✅ Ya | Mau audit code quality, security, performance — full scan | `/workflow audit` |
| `production` | ✅ Ya | Sebelum deploy ke production — cek readiness | `/workflow production` |
| `test` | ❌ No | Mau nambah test cases — AI planning + implement test | `/workflow test "unit test payment"` |
| `memory` | ✅ Ya | Mau update project memory (tech stack, architecture, dll) | `/workflow memory "update tech stack"` |
| `default` | ❌ No | General task — kerja normal tapi tetap terstruktur | Otomatis kalo gak specify mode |

**Read-Only modes** (`teach`, `audit`, `production`, `memory`) = aman. AI cuma baca dan analisis, gak bisa edit file.

---

## All Extensions Commands Reference

### Senior Engineer Workflow
```bash
/workflow <mode> "<task>"        # Start workflow dengan mode tertentu
/workflow_status                 # Cek status workflow yang sedang jalan
/workflow_cancel                 # Cancel workflow yang sedang jalan
/workflow_checkpoint "<label>"   # Simpen checkpoint (bisa rollback)
```

### Project Init
```bash
/init                            # Generate AGENTS.md di root project
```

### Task Delegator
```bash
/delegate research "<task>"      # Riset library / best practice
/delegate review "<file>"        # Review file tertentu
/delegate audit "<area>"         # Audit bagian tertentu
/delegate plan "<fitur>"         # Buat implementation plan
/delegate refactor "<file>"      # Analisis refactoring strategy
/delegate test "<module>"        # Planning test cases
/delegate analyze "<path>"       # Code quality check
/delegate explain "<code>"       # Explain complex code
```

> **Note:** Codex juga bisa panggil delegate otomatis lewat tool `senior_engineer_delegate_task`.
> Ini terjadi kalo AI lagi kerja di mode workflow (`fix`/`feature`/`audit`) dan butuh riset / audit / plan.
> Syarat: AGENTS.md harus udah di-init (via `/init`).

### Project Memory
```bash
/memory_show                     # Lihat memory project
/memory_path                     # Lihat path file memory
/memory_update "<note>"          # Update memory manual
```

### Context Pack
```bash
/context_index                   # Generate context pack (file tree + tech stack)
/context_show                    # Lihat context pack
/context_focus <keyword>         # Cari file by keyword
```

### Docker Runner
```bash
/test_detect                     # Deteksi test/lint/build command
/test_run "<command>"            # Jalanin command (prioritas Docker)
```

### Review Gate
```bash
/review_diff                     # Review code diff (correctness, regression)
/review_security                 # Review security (auth, injection, secrets)
/review_ui                       # Review UI (loading, error, empty states)
/review_api                      # Review API (contracts, validation, status codes)
/review_db                       # Review database (migration, indexes, N+1)
```

---
*Setup by [ztrenggono](https://github.com/ztrenggono)*
