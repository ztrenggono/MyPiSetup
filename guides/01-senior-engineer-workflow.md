# Senior Engineer Workflow

## What It Does

Mode-based development workflow. Ngatur AI agent biar kerja terstruktur — bukan asal ngetik.
Ada 9 mode, masing-masing dengan prompt yang ngatur cara AI bertindak.

## When to Use It

| Mode | Kapan? |
|------|--------|
| `teach` | Project baru — suruh AI pahamin project dulu |
| `fix` | Ada bug — AI harus fix dengan minimal change |
| `feature` | Mau nambah fitur — AI planning dulu baru implement |
| `refactor` | Mau refactor — AI analisis risk dulu |
| `audit` | Mau cek production readiness — AI audit full |
| `production` | Mau deploy — AI cek production readiness |
| `test` | Mau nambah test — AI planning test cases |
| `memory` | Mau update memory project — AI update otomatis |
| `plan` | Project greenfield — AI baca docs/PRD/spec, bikin PLAN.md dengan phased breakdown | `/workflow plan "e-commerce app"` |
| `default` | General — AI kerja normal tapi terstruktur |

## Step by Step

### 1. Pahamin Project Baru

```bash
/workflow teach
```

AI bakal:
- Baca struktur folder
- Identifikasi tech stack
- Simpen memory ke file
- Lo bisa lanjut tanya-tanya

### 2. Fix Bug

```bash
/workflow fix "tombol login error 500 pas input kosong"
```

AI bakal:
1. Understand — baca code related
2. Plan — tentuin approach
3. Implement — bikin fix minimal
4. Test — jalanin test
5. Report — explain what changed

### 3. Nambah Fitur

```bash
/workflow feature "tambah halaman profile user"
```

### 4. Audit Project

```bash
/workflow audit
```

### 5. Production Check

```bash
/workflow production
```

### 6. Cek Status

```bash
/workflow_status
```

### 7. Cancel Workflow

```bash
/workflow_cancel
```

### 8. Simpen Checkpoint

```bash
/workflow_checkpoint "before big refactor"
```

## How It Prevents AI Hallucination

- Read-only mode (`teach`, `audit`, `production`, `memory`) — AI nggak bisa edit file.
- Wajib `understand -> plan -> implement -> test -> report` — bukan langsung edit.
- Ada checkpoint — bisa rollback kalo salah arah.
- State persisted — AI inget stage workflow-nya.

## Anti-Hallucination Rules

1. **Wajib inspect** sebelum ngaku paham.
2. **Wajib plan** sebelum edit.
3. **Wajib test** setelah implement.
4. **Gak boleh ngaku** test passed kalo belum dijalanin.
5. **Gak boleh** hapus/ubah kode existing tanpa alasan jelas.

---
*by ztrenggono*
