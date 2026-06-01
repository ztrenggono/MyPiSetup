# Project Init

## What It Does

Generate `AGENTS.md` di root project lo. File ini adalah **system prompt tambahan**
yang dibaca Pi setiap session start — isinya senior engineering rules lengkap.

Rules yang di-generate:
- Role & core behavior
- Default workflow (understand → inspect → plan → implement → verify → report)
- Small patch mode
- Senior engineering standards
- IT consultant mindset
- Architecture principles
- Security rules
- API rules
- Database rules
- Frontend rules
- Testing rules
- Docker & environment rules
- Git rules
- Review rules
- Production readiness review
- Audit mode
- Communication style
- Decision-making rules
- Task delegation & sub-agent orchestration
- Definition of done

## When to Use It

- **Project baru** — jalanin `/init` setelah `/workflow teach`
- **Setup ulang** — kalo AGENTS.md kehapus atau korup

## Step by Step

### 1. Teach Dulu

```bash
/workflow teach
```

Ini penting biar AI paham project lo dan nyimpen memory.

### 2. Init AGENTS.md

```bash
/init
```

AI bakal:
- Cek kalo AGENTS.md udah ada → skip (gak overwrite)
- Baca memory dari `/workflow teach`
- Merge sections: Project Understanding, Tech Stack, Architecture, dll
- Tulis AGENTS.md

### 3. Selesai

AGENTS.md langsung aktif. Pi otomatis baca file ini next session.

## Important

- **JANGAN edit AGENTS.md.** Cuma boleh append (tambah) di bagian akhir.
- Kalo ada perubahan rules, lo bisa append, tapi jangan hapus yang existing.
- Kalo mau regenerate, hapus dulu file-nya, baru `/init` lagi.

## How It Prevents AI Hallucination

- AI punya **standard eksplisit** — nggak asal nebak gimana harus kerja.
- Ada **definition of done** — AI tau kapan tugas beneran selesai.
- Ada **safety rules** — AI minta approval sebelum tindakan berbahaya.
- Ada **delegation guide** — AI tau kapan harus pake sub-agent.
- Bahasa Indonesian untuk explanation — sesuai preference user.

---
*by ztrenggono*
