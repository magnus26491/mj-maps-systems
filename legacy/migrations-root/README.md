# ⚠️ Orphan — Do Not Use

This directory is **not the active migrations folder**.

## What happened

During an early development phase, migration files were stored here at the repo root.
They have since been moved into `services/db/migrations/` which is the **authoritative**
location read by `services/db/migrate.ts` and copied into `dist/` at build time.

## Files here vs. the real ones

| Root orphan | In `services/db/migrations/` |
|---|---|
| 006–017 | 000–020 |
| Never used | Active, shipped to Docker image |

The two sets are **divergent** — the orphan files (006–017) were never renamed or
rebased when the authoritative set was created, so they are completely out of sync
with the DB schema that Railway actually applies.

## Action required

- **Do not run migrations from this directory.**
- **Do not add new migrations here.**
- All new migrations must go into `services/db/migrations/` with the next sequential
  number (021, 022, …).
- This directory will be removed in a future cleanup commit.
