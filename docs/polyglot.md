# Polyglot Additions

This repository now includes four additional technology tracks:

- TypeScript
- SQL
- Python
- Docker

## TypeScript

- Config file: `tsconfig.json`
- Source folder: `tools/ts/`
- Example script: `tools/ts/messageStats.ts`

Commands:

- `npm run typecheck`
- `npm run build:ts`
- `npm run stats:messages`

## SQL

- Schema file: `backend/sql/schema.sql`
- Query examples: `backend/sql/queries.sql`

You can apply `schema.sql` in SQLite or adapt it for PostgreSQL/MySQL.

## Python

- Script folder: `scripts/python/`
- Example script: `scripts/python/message_report.py`
- Dependencies: standard library only (`requirements.txt` included as a reference)

Command:

- `npm run python:report`

## Docker

- Image definition: `Dockerfile`
- Multi-service compose: `docker-compose.yml`

Commands:

- `npm run docker:up`
- `npm run docker:down`

Notes:

- `php` service exposes `http://localhost:8000`
- `node` service exposes `http://localhost:3000`
