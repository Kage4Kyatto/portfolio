# Full-Stack Portfolio Website

This project contains a 5-page portfolio frontend and a PHP backend API.

## Docs

- `docs/architecture.md` runtime architecture and backend/frontend boundaries
- `docs/deployment.md` deployment guidance and root config file usage
- `docs/security.md` authentication, abuse prevention, and operational security notes
- `docs/polyglot.md` TypeScript, SQL, Python, and Docker usage notes

## Pages

- Home
- About
- Projects
- Services
- Contact
- Admin (messages dashboard)

## Folder Structure

- `public/` frontend pages and static assets
- `public/api/` PHP API endpoints
- `public/assets/css/` shared styles
- `public/assets/js/core/` shared frontend scripts
- `public/assets/js/pages/` page-specific frontend scripts
- `backend/php/bootstrap.php` shared PHP backend utilities
- `backend/php/data/` local JSON storage for contact messages
- `backend/node/` optional Node API implementation
- `backend/fastify/` Fastify backend framework module
- `backend/sql/` SQL schema and query examples
- `frontend/react-app/` React + Vite frontend framework module
- `scripts/python/` Python utility scripts
- `tools/ts/` TypeScript utility scripts
- `Dockerfile` and `docker-compose.yml` for containerized runs

## Architecture

- Primary runtime (PHP): use `php -S localhost:8000 -t public` and PHP endpoints in `public/api/*.php`.
- Secondary runtime (Node): use `npm start` and Express endpoints under `/api` from `backend/node/routes/`.
- Shared frontend: `public/` is served by both runtimes.
- Contact API compatibility: frontend tries `/api/contact` first and falls back to `/api/contact.php`.

## Run Locally

1. Ensure PHP is installed.
2. Ensure Node.js is installed (for JavaScript tests and CI parity).
3. Set environment variables for admin auth:
   - `ADMIN_USER=...`
   - `ADMIN_PASS=...`
   - Optional hash alternative: `ADMIN_PASS_HASH=<sha256-hex>`
- Optional OTP requirement: `ADMIN_OTP_CODE=<code>`
- For production Node runtime, set: `ADMIN_SESSION_SECRET`, `ADMIN_USER`, and either `ADMIN_PASS` or `ADMIN_PASS_HASH`
4. Start local PHP server from project root:
   - `php -S localhost:8000 -t public`
5. Open:
   - `http://localhost:8000`

### Optional Runtime Tooling

- Database migration (PostgreSQL): `npm run migrate:db`
- TypeScript type-check: `npm run typecheck`
- TypeScript build output: `npm run build:ts`
- TypeScript message statistics report: `npm run stats:messages`
- Python message report: `npm run python:report`
- Docker multi-service run: `npm run docker:up`
- Docker stop: `npm run docker:down`

## Added Framework Modules

You can now run multiple frameworks in parallel with the existing static/PHP/Express setup.

- Frontend framework module (React + Vite):
   - Install: `npm run install:react`
   - Dev server: `npm run dev:react`
   - Build: `npm run build:react`
   - Preview build: `npm run preview:react`
- Backend framework module (Fastify):
   - Install: `npm run install:fastify`
   - Dev server: `npm run dev:fastify`
   - Start server: `npm run start:fastify`

Fastify defaults to port `4001` and exposes:

- `GET /health`
- `POST /contact`

React app route under the Node runtime:

- Build React assets: `npm run build:app`
- Start Node server: `npm start`
- Open: `http://localhost:3000/app`

Contact endpoint order now is:

1. Fastify `/contact` (from `PORTFOLIO_FASTIFY_URL`, localhost default)
2. Node `/api/contact`
3. PHP `/api/contact.php`

When running the Node server, `PORTFOLIO_FASTIFY_URL` is exposed to browser scripts through `/runtime-config.js`.

## Shared Environment Strategy

Use root `.env` for backend runtime ports/origins and `frontend/react-app/.env` for React-specific values.

- Root `.env.example` includes:
   - `PORT`
   - `FASTIFY_PORT`
   - `PORTFOLIO_FASTIFY_URL`
   - `VITE_PORT`
   - `VITE_NODE_RUNTIME_ORIGIN`
   - `VITE_FASTIFY_RUNTIME_ORIGIN`
   - `VITE_PHP_RUNTIME_ORIGIN`
- React `.env.example` includes:
   - Runtime origins for Node/Fastify/PHP
   - Health endpoint paths used by the React dashboard

## Security Notes

- See `docs/security.md` for detailed controls and production recommendations.
- Admin authentication now requires explicit env vars. No fallback credentials are used.
- Admin login attempts are throttled and temporarily blocked after repeated failures.
- Contact submissions have stricter validation and IP-based sliding-window rate limiting.
- Optional Cloudflare Access gate for admin routes:
   - `CF_ACCESS_ENABLED=true`
   - `CF_ACCESS_ALLOWED_EMAILS=you@example.com` (comma-separated for multiple users)
   - When enabled, `/admin`, `/admin.html`, and `/api/messages` require the Cloudflare Access user email header and (for admin) Basic auth.

## Contact Email Forwarding

- To forward each new contact submission to your inbox, set these environment variables:
   - `CONTACT_NOTIFY_TO=your-email@example.com`
   - `CONTACT_NOTIFY_FROM=no-reply@your-domain.com` (optional but recommended)
   - `RESEND_API_KEY=...` (recommended for reliable delivery)
- Delivery order:
   - First tries Resend API when `RESEND_API_KEY` is set.
   - Falls back to PHP `mail()` when Resend is not configured or fails.
- The API stores each message in JSON and also attempts immediate email delivery.
- If you use `CONTACT_NOTIFY_FROM`, it should be a sender address allowed by your provider/domain.

## SEO and Performance Notes

- Added canonical and robots meta tags, OG URL metadata, deferred script loading, and dynamic host-aware robots/sitemap responses from the Node runtime.
- Added `public/robots.txt` and `public/sitemap.xml` static fallbacks for non-Node hosting.
- Lighthouse CI runs against multiple pages and enforces score thresholds in `lighthouserc.json`.

## Tests and CI

- Install dependencies: `npm install`
- Run lint checks: `npm run lint`
- Run tests: `npm test`
- Run TypeScript checks: `npm run typecheck`
- Reset contact demo/test data to defaults: `npm run reset:contact-data`
- Restore contact data files to the exact tracked Git state: `npm run clean:contact-data`
- GitHub Actions quality workflow: `.github/workflows/quality.yml`
- GitHub Actions release workflow: `.github/workflows/release.yml`

## Added Languages and Tooling

- TypeScript:
   - Config: `tsconfig.json`
   - Example utility: `tools/ts/messageStats.ts`
- SQL:
   - Schema: `backend/sql/schema.sql`
   - Query examples: `backend/sql/queries.sql`
- Python:
   - Utility report script: `scripts/python/message_report.py`
   - Standard-library only setup in `requirements.txt`
- Docker:
   - Single image config: `Dockerfile`
   - Multi-service orchestration: `docker-compose.yml`

## Keeping Git Status Clean After Demos

- Contact form demos update `backend/php/data/messages.json` and `backend/php/data/contact_rate_limits.json`.
- To clear those runtime files back to defaults, run:
   - `npm run reset:contact-data`
- To remove Git status noise from those two files (restore tracked state), run:
   - `npm run clean:contact-data`
- Verify with:
   - `git status --short`

## API Endpoints

- `GET /api/health.php`
- `GET /api/messages.php` (requires Basic auth with `ADMIN_USER` and `ADMIN_PASS` or `ADMIN_PASS_HASH`)
- `POST /api/contact.php`

## Admin Dashboard

- URL: `/admin.html`
- Enter admin username and password to load submissions.
- If Cloudflare Access mode is enabled, only allowed Cloudflare Access users can reach the admin page/API.
- Contact form submissions are stored in `backend/php/data/messages.json`.
- Includes client-side search, pagination, and CSV export for loaded messages.

### Password Hash Option

- You can set `ADMIN_PASS_HASH` (SHA-256 hex string) and keep `ADMIN_PASS` empty.
- Generate SHA-256 in PowerShell:
   - `[Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("your-password"))).ToLower()`

## Deployment

- See `docs/deployment.md` for centralized deployment notes.
- Root deployment config files intentionally remain at the repository root:
   - `render.yaml`
   - `railway.json`

### Render

1. Push this project to GitHub.
2. Create a PHP web service.
3. Set the publish directory to `public`.
4. Set `ADMIN_USER` and either `ADMIN_PASS` or `ADMIN_PASS_HASH` in environment variables.

### Railway

1. Push this project to GitHub.
2. In Railway, create a new project from the repository.
3. Use a PHP runtime setup (or Docker) with document root pointing to `public`.
4. Add `ADMIN_USER` and either `ADMIN_PASS` or `ADMIN_PASS_HASH` in Railway settings.
