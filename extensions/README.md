# Pi Extensions — Installation Guide

Extensions ini harus di `~/.pi/agent/extensions/` biar otomatis ke-load sama Pi.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
cp *.ts ~/.pi/agent/extensions/
```

Then restart Pi atau ketik `/reload` di dalem Pi.

## Files

| File | Size | Auto-loaded |
|------|------|-------------|
| `senior-engineer-workflow.ts` | 13 KB | Ya |
| `project-init.ts` | 25 KB | Ya |
| `task-delegator.ts` | 13 KB | Ya |
| `project-memory.ts` | 4 KB | Ya |
| `context-pack.ts` | 8 KB | Ya |
| `docker-runner.ts` | 6 KB | Ya |
| `review-gate.ts` | 4 KB | Ya |

## Uninstall

Tinggal hapus file-nya:

```bash
rm ~/.pi/agent/extensions/senior-engineer-workflow.ts
# dst
```

## Dependency

Extensions ini butuh Pi version terbaru. Cek dengan:

```bash
pi --version
```

Kalo ada error `Cannot find module`, jalanin:

```bash
pi -e /dev/null  # trigger re-load semua extensions
```

## Extension Loading Order

Pi load extension dalam urutan alphabetical. Urutan ini penting karena
`before_agent_start` event chain sesuai urutan load:

1. `context-pack.ts` — inject context pack ke system prompt
2. `docker-runner.ts` — tambah tool test detection
3. `project-init.ts` — register `/init` command
4. `project-memory.ts` — inject memory ke system prompt
5. `review-gate.ts` — register review commands
6. `senior-engineer-workflow.ts` — inject workflow prompt, register workflow commands
7. `task-delegator.ts` — register delegate tool & command

---
*Extensions by ztrenggono*
