# Database Migrations

> The authoritative migration directory. All files `000`–`020` are idempotent
> (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Copied into Docker at build time.

## Running

```bash
# Development
npm run migrate

# Production (Railway pre-deploy)
npm run migrate:prod
```
