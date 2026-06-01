# Review Gate

## What It Does

Code review terstruktur berdasarkan git diff project. Ada 5 fokus area,
masing-masing dengan prompt review yang beda.

## Modes

| Command | Fokus Review |
|---------|--------------|
| `/review_diff` | Correctness, regression, edge cases, error handling, maintainability |
| `/review_security` | Auth, authorization, secrets, injection, SSRF, XSS, CSRF |
| `/review_ui` | Loading states, empty states, error states, responsive, accessibility |
| `/review_api` | API contracts, validation, status codes, auth middleware, backward compat |
| `/review_db` | Schema migration risk, indexes, N+1, transaction safety, data loss |

## When to Use It

- **Before commit** — `/review_diff` buat cek perubahan
- **Before PR** — `/review_security` + `/review_api` + `/review_db`
- **Before deploy** — semua review sekaligus
- **Code review session** — minta AI review kode orang lain

## Step by Step

### 1. Review Diff (Default)

```bash
/review_diff
```

Output:
```
## Executive Summary
[ringkasan]

## P0 Findings
- [critical issue]

## P1 Findings
- [important issue]

## P2 Findings
- [improvement]

## Recommended Patch Plan
[step by step fix]

## Test Recommendation
[apa yang harus dites]
```

### 2. Review Security

```bash
/review_security
```

Cek: auth leak, hardcoded secrets, SQL injection, XSS, CSRF, SSRF, path traversal.

### 3. Review API

```bash
/review_api
```

Cek: contract breaking, missing validation, wrong status codes, auth middleware missing.

### 4. Review UI

```bash
/review_ui
```

Cek: loading state missing, error state missing, empty state missing, responsive broken.

### 5. Review Database

```bash
/review_db
```

Cek: migration risk, missing indexes, N+1 query, transaction safety.

### All-in-One

Kalo mau review lengkap, jalanin semua:

```bash
/review_diff
/review_security
/review_api
/review_db
/review_ui
```

## How It Prevents AI Hallucination

- Review based on **real git diff** — bukan asal nebak "kayaknya aman".
- Ada **severity labels** (P0/P1/P2) — gak semua temuan dianggap sama penting.
- Output **terstruktur** — gak campur aduk antara security issue sama typo.
- Wajib ada **patch plan** — bukan cuma ngomong "ini salah" tapi gak kasih solusi.
- Wajib ada **test recommendation** — biar bisa diverifikasi.

---
*by ztrenggono*
