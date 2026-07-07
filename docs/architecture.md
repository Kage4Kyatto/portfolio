# Architecture Notes

## Runtime Model

This project supports two backend runtimes that share the same frontend pages in `public/` and the same data store in `backend/php/data/`.

- PHP runtime (primary for production PHP hosting):
  - Serves frontend from `public/`
  - Uses PHP API endpoints in `public/api/*.php`
  - Typical local URL: `http://localhost:8000`
- Node runtime (secondary for local development/tests):
  - Serves frontend with Express static middleware
  - Uses Express routes under `/api` from `backend/node/routes/`
  - Typical local URL: `http://localhost:3000`

In addition, the repository now includes standalone framework modules:

- React frontend module:
  - Path: `frontend/react-app/`
  - Runs on Vite dev server (default `http://localhost:5173`)
  - Builds to `frontend/react-app/dist` and is served by Express at `/app`
- Fastify backend module:
  - Path: `backend/fastify/`
  - Runs as independent API service (default `http://localhost:4001`)

## API Compatibility

Contact form submission supports both runtimes via endpoint fallback in `public/assets/js/pages/contact.js`:

1. Try `POST /api/contact` (Node route)
2. Fallback to `POST /api/contact.php` (PHP route)

The PHP endpoint is the authoritative notification sender. It stores the message and sends email through `send_contact_notification_email()` in `public/api/contact.php`. The Node route exists for local/runtime compatibility and persistence, but it no longer owns notification dispatch.

This keeps the same frontend behavior across both local server modes.

Contact submission order for `public/contact.html`:

1. Fastify `/contact` (`PORTFOLIO_FASTIFY_URL` or localhost fallback)
2. Node `/api/contact`
3. PHP `/api/contact.php`

React dashboard checks use Vite bridge proxies during development:

- `/bridge/fastify/*`
- `/bridge/node/*`
- `/bridge/php/*`

## Backend Layout

- `backend/node/controllers/`: Node route handlers
- `backend/node/routes/`: Node route definitions
- `backend/node/middleware/`: Node auth middleware
- `backend/fastify/src/`: Fastify framework service routes
- `backend/php/bootstrap.php`: shared PHP helpers
- `backend/php/data/`: JSON persistence for messages and rate-limits

## Test Layout

- `tests/unit/`: fast unit-level checks for utilities, middleware, and focused helpers
- `tests/integration/`: API and runtime-contract tests that exercise the Node app end to end
- `tests/e2e/`: browser-driven Playwright flows for the public site and admin dashboard

## Frontend Layout

- `public/*.html`: static pages
- `public/assets/css/`: shared styling
- `public/assets/js/core/`: shared scripts
- `public/assets/js/pages/`: page-specific logic
- `frontend/react-app/src/`: React + Vite frontend framework module
