# Database Upgrade Plan

## Target
- Primary: PostgreSQL
- Local development option: SQLite

## Tables
- `contact_messages`
- `contact_rate_limits`
- `admin_auth_attempts`
- `telemetry_events`

## Migration Strategy
1. Keep JSON storage as fallback.
2. Introduce DB-backed repository interfaces.
3. Run dual-write phase.
4. Switch reads to DB once verified.

## SQL Baseline
- See `backend/php/sql/schema.sql` for current structures.
- Add DB-specific migrations in a future iteration.
