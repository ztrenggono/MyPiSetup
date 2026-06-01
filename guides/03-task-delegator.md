# Task Delegator

## What It Does

Spawn sub-agent terisolasi di proses `pi` terpisah. Sub-agent punya **context sendiri**,
gak ngeliat history chat lo. Hasilnya balik sebagai output tool.

Sub-agent pake **provider dan model yang sama** dengan session utama lo.
Jadi kalo lo pake `openai-codex` + `gpt-5.5`, sub-agent juga pake itu.

Ini bedanya sama nanya langsung ke AI:
- Nanya langsung → context lo makin penuh = lebih mahal + lebih lambat
- Delegate → sub-agent pake context sendiri = hemat token, lebih fokus

## Modes

| Mode | Use Case | Contoh |
|------|----------|--------|
| `research` | Bandingin library, cari best practice | "Cara setup Redis di NestJS, include best practices" |
| `review` | Code review file tertentu | "Review auth.service.ts — cari security issue" |
| `refactor` | Analisis refactoring strategy | "Analisis controller.ts — saran refactor" |
| `test` | Planning test cases | "Buat test plan untuk payment module" |
| `analyze` | Code quality check | "Analisis complexity di folder src/" |
| `audit` | Security / production audit | "Audit security untuk API endpoints" |
| `plan` | Implementation plan | "Buat plan implementasi fitur chat realtime" |
| `explain` | Explain complex code | "Jelasin flow authentication dari login sampe JWT" |

## When to Use It

**Delegate kalo:**
- Task-nya standalone (riset library, review file, audit)
- Butuh context fokus tanpa gangguan history
- Task-nya makan banyak token (baca banyak file)
- Lo mau hemat token di session utama

**JANGAN delegate kalo:**
- Task-nya butuh konteks dari chat lo sebelumnya
- Lo mau AI beneran edit file
- Task-nya trivial (cukup 1 grep)
- Task-nya butuh koordinasi dengan perubahan file lain

## Step by Step

### Via Command (Manual)

```bash
/delegate research "cara setup Prisma ORM di Express.js, include migration strategy"
```

### Via Tool (Otomatis oleh AI)

Pas AI lagi kerja (misal di mode `fix` / `feature` / `audit`), Codex bisa panggil tool
`senior_engineer_delegate_task` otomatis kalo merasa butuh riset:

```
Task: "Research Prisma vs Drizzle untuk project ini"
AI: [panggil senior_engineer_delegate_task(mode: "research", task: "Bandingin Prisma vs Drizzle ORM...")]
```

Tool ini registered dan visible ke model. Tapi AI cuma bakal panggil kalo:
- Task-nya jelas standalone (butuh riset / audit / plan)
- AGENTS.md udah di-init (biar AI tau kapan harus delegate)
- Lo lagi di mode workflow yang mendukung (`fix`, `feature`, `audit`, `refactor`)

## Example Use Case Skenario

Lo: "Cari tau cara deploy Next.js ke VPS pake PM2"

**Without delegate:**
- AI baca semua context project lo (mungkin 80K token)
- Terus riset deployment (bisa 20K token tambahan)
- Total: 100K token, bayar mahal

**With delegate:**
- `/delegate research "Cara deploy Next.js ke VPS pake PM2, step by step"`
- Sub-agent jalan sendiri, 0 token dari context lo
- Balikin hasil, lo cukup summarizenya
- Total: 10-20K token, hemat 80%

## How It Prevents AI Hallucination

- Sub-agent **read-only** — gak bisa edit file seenaknya.
- Sub-agent **gak tau konteks chat lo** — fokus ke task doang.
- Hasilnya **eksplisit** — lo bisa verify sendiri.
- Kalo sub-agent gagal, errornya keliatan jelas.

---
*by ztrenggono*
