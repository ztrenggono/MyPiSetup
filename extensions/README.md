# Pi Extensions — Installation Guide

Extensions ini harus di `~/.pi/agent/extensions/` biar otomatis ke-load sama Pi.

## Install

```bash
mkdir -p ~/.pi/agent/extensions
cp *.ts ~/.pi/agent/extensions/

# Opsional: Codex tools (exec_command, apply_patch, image_generation, view_image)
pi install npm:@howaboua/pi-codex-conversion
```

Lalu restart Pi atau ketik `/reload` di dalem Pi.

## Files

| File | Auto-loaded | Fungsi |
|------|-------------|--------|
| `senior-engineer-workflow.ts` | Ya | Core workflow: modes, git checkpoint, decision helper, ASCII mascot |
| `project-init.ts` | Ya | Generate AGENTS.md |
| `task-delegator.ts` | Ya | Spawn sub-agent untuk riset/review/plan |
| `project-memory.ts` | Ya | Persistent memory + correction detection + memory tool |
| `context-pack.ts` | Ya | Context pack: file tree + tech stack |
| `docker-runner.ts` | Ya | Test/lint/build di Docker |
| `review-gate.ts` | Ya | Structured code review (diff, security, UI, API, DB) |
| `zz-identity-guard.ts` | Ya | Identity guard — re-assert Pi identity (loads LAST) |

## Uninstall

Tinggal hapus file-nya:

```bash
rm ~/.pi/agent/extensions/<nama-file>.ts
```

Kalo mau remove codex-conversion juga:

```bash
pi remove npm:@howaboua/pi-codex-conversion
```

## Extension Loading Order

Pi load extension dalam urutan alphabetical. Urutan ini penting karena
`before_agent_start` event chain sesuai urutan load:

1. `context-pack.ts`
2. `docker-runner.ts`
3. `project-init.ts`
4. `project-memory.ts` — inject memory entries
5. `review-gate.ts`
6. `senior-engineer-workflow.ts` — inject persona + workflow instruction (TOP)
7. `task-delegator.ts`
8. (npm) `@howaboua/pi-codex-conversion` — inject Codex guidelines (MIDDLE)
9. `zz-identity-guard.ts` — inject identity guard (BOTTOM, recency effect)

## Dependency

Extensions ini butuh Pi version terbaru. Cek dengan:

```bash
pi --version
```

Kalo ada error `Cannot find module`, jalanin:

```bash
pi -e /dev/null  # trigger re-load semua extensions
```

## Notes

- Memory extension **zero token burn** — semua operasi pake fs.write langsung, tanpa LLM subprocess.
- Identity guard (`zz-`) dipastiin load paling akhir biar identity Pi tetap terjaga.
- Codex-conversion optional; kalo gak diinstall, semua fitur workflow tetap jalan normal.

---
*Extensions by ztrenggono*
