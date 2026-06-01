# Project Memory

## What It Does

Nyimpen konteks project ke file markdown di `~/.pi/agent/memories/senior-engineer-workflow/projects/`.
File ini otomatis di-inject ke system prompt AI setiap session start.

Sections yang disimpen:
- **Project Understanding** — apa yang project ini lakuin
- **Tech Stack** — framework, database, ORM, dll
- **Architecture** — struktur project, pattern yang dipake
- **Commands** — cara run, test, build, lint, deploy
- **Risks / TODO** — hal yang perlu diinget
- **Task History** — log pekerjaan yang udah dilakukan

## When to Use It

- **Project baru** — biar AI inget konteks dari session ke session
- **Tech stack berubah** — update memory
- **Ada risk atau todo penting** — catet biar AI inget
- **Selesai task besar** — catet di task history

## Step by Step

### Lihat Memory

```bash
/memory_show
```

### Lihat Path File

```bash
/memory_path
```

### Update Memory Manual

```bash
/memory_update "Ganti database dari MySQL ke PostgreSQL karena perlu JSONB"
```

Ini nambah entry baru di "Manual Memory Update" section.

### Update Memory Otomatis (via Workflow)

```bash
/workflow memory "update tech stack, sekarang pake Prisma bukan Drizzle"
```

### Hapus Memory (manual)

Kalo mau reset, tinggal hapus file-nya:

```bash
rm ~/.pi/agent/memories/senior-engineer-workflow/projects/<project-slug>.md
```

## How It Prevents AI Hallucination

- AI inget tech stack beneran — gak asal nebak "mungkin pake MySQL".
- AI inget commands — gak asal nebak "mungkin `npm start`".
- AI inget risk — gak lupa ada todo penting.
- Memory persist antar session — gak ilang pas ganti project.

---
*by ztrenggono*
