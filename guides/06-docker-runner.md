# Docker Runner

## What It Does

Deteksi command test/lint/build yang tersedia di project, terus jalanin.
Prioritas pake Docker (docker compose atau `docker run`) biar isolated.

## When to Use It

- **Jalanin test** — biar AI beneran execute test, bukan cuma ngomong "test passed".
- **Cek lint** — verify code quality.
- **Cek build** — verify project masih bisa build.
- **Di environment tanpa dependency** — pake Docker biar gak perlu install di host.

## Step by Step

### Deteksi Command

```bash
/test_detect
```

AI bakal scan:
- `package.json` → scripts (test, lint, build, typecheck)
- `pnpm-lock.yaml` → pnpm commands
- `yarn.lock` → yarn commands
- `requirements.txt` / `pyproject.toml` → pytest
- `go.mod` → go test
- `composer.json` → phpunit / artisan
- Docker detection → `docker-compose.yml` atau `Dockerfile`

### Jalanin Command

```bash
/test_run "npm test"
```

Atau kalo dari tool (dipanggil AI):

```
Task: "Jalanin test"
AI: [panggil senior_engineer_detect_test_commands(), terus /test_run "npm test"]
```

### Output

AI bakal return:
- Command yang dijalanin
- Exit code
- Output (last 12K chars)
- Error kalo ada

## Docker Behavior

| Condition | Action |
|-----------|--------|
| Ada `docker-compose.yml` | `docker compose run --rm app <command>` |
| Ada `Dockerfile` + Node | `docker run --rm -v $(pwd):/app -w /app node:20-alpine <command>` |
| Ada `Dockerfile` + Python | `docker run --rm -v $(pwd):/app -w /app python:3.12-slim <command>` |
| Gak ada Docker | Jalanin langsung di host |

## How It Prevents AI Hallucination

- AI **beneran jalanin** test — bukan asal ngaku "test passed".
- AI **beneran cek** build — bukan asal bilang "build success".
- AI pake Docker — gak ada alesan "dependency gak terinstall".
- Exit code 0 = passed, exit code != 0 = failed. No interpretation needed.

---
*by ztrenggono*
