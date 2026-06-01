# Context Pack

## What It Does

Generate snapshot konteks project. Isinya:
- File tree (sampe 4 level dalem)
- Tech stack detection (Next.js, React, Express, dll)
- Config file highlights
- Route & backend hints
- Component & UI hints
- Test hints

File disimpen di `~/.pi/agent/context-packs/senior-engineer-workflow/projects/`
dan otomatis di-inject ke system prompt tiap session start.

## When to Use It

- **Project baru** — jalanin `/context_index` setelah `/workflow teach`
- **Update konteks** — kalo nambah folder / file penting
- **Cari file** — `/context_focus <keyword>` buat search file

## Step by Step

### Generate Context Pack

```bash
/context_index
```

AI bakal:
1. Walk project tree (skip `.git`, `node_modules`, `dist`, dll)
2. Deteksi tech stack dari `package.json` / config files
3. Catet config files yang menarik
4. Catet route hints
5. Catet test hints
6. Simpen ke file markdown

### Lihat Context Pack

```bash
/context_show
```

### Cari File by Keyword

```bash
/context_focus auth
```

Bakal return list file path yang match keyword "auth", max depth 5.

## Example Output

```
# Context Pack: myProject

## Tech Stack
- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- PostgreSQL

## File Tree
myProject/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── api/
│   ├── components/
│   ├── lib/
│   └── styles/

## Interesting Config Files
- next.config.ts
- tailwind.config.ts
- prisma/schema.prisma

## Route Hints
- src/app/page.tsx (homepage)
- src/app/api/auth/[...nextauth] (auth API)
```

## How It Prevents AI Hallucination

- AI punya **file tree real** — gak asal nebak struktur folder.
- AI tau **tech stack beneran** — gak asal nebak "project ini pake Vue".
- AI bisa **search file** — gak bilang "file not found" padahal ada.
- Context pack otomatis inject — AI gak perlu tanya "struktur project gimana".

---
*by ztrenggono*
