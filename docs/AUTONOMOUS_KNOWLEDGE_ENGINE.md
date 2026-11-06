# Autonomous MLBB Knowledge Engine

Continuously discovers, validates, versions, and updates Mobile Legends: Bang Bang knowledge without portal manual entry.

## Architecture

- **Package:** `packages/knowledge-engine`
- **Persists into existing Game KB** via `game-knowledge-import-v1` → draft patches (human publish still required)
- **Extended catalogs** (items, maps, monsters, patch summaries, sync jobs): migration `00015_autonomous_knowledge_engine.sql`
- **Match Studio** consumes compact context via `buildMatchKnowledgeContextPackage` (never the full DB)
- **Scheduler:** `pnpm knowledge-engine:scheduler` (preferred over Supabase free-tier cron)

## Sources

| Priority | Source | Label |
|---|---|---|
| 1 | `https://www.mobilelegends.com/` | Official — homepage monitoring (SPA; undocumented JSON APIs not assumed) |
| 2 | `https://play.mobilelegends.com/` | Official portal watch |
| 3 | MLBB Fandom MediaWiki API | **Community-derived** heroes/items |
| 4 | Liquipedia MLBB API | **Community-derived** esports |
| 5 | Advance Server keyword watch | Isolated `advance` server_type |

## Commands

```bash
pnpm --filter @ai-shorts-factory/knowledge-engine build
pnpm knowledge-engine:bootstrap -- --hero-limit 30
pnpm knowledge-engine:sync -- --kind patch_monitor
pnpm knowledge-engine:scheduler
```

Portal: `/game-knowledge` → Autonomous Engine dashboard (Activate / Sync now / Retry).

## Original vs Advance

Every extended record carries `server_type`. Advance never overwrites Original. When the same `patch_identifier` appears on both, a relationship link is recorded while histories remain separate.

## Supabase

Apply migrations through `00015_autonomous_knowledge_engine.sql`. Service role stays server-side only. Long syncs run in Node scheduler/worker — not Edge Functions.
