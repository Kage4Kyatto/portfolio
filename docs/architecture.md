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

## API Compatibility

Contact form submission supports both runtimes via endpoint fallback in `public/assets/js/pages/contact.js`:

1. Try `POST /api/contact` (Node route)
2. Fallback to `POST /api/contact.php` (PHP route)

This keeps the same frontend behavior across both local server modes.

## Backend Layout

- `backend/node/controllers/`: Node route handlers
- `backend/node/routes/`: Node route definitions
- `backend/node/middleware/`: Node auth middleware
- `backend/php/bootstrap.php`: shared PHP helpers
- `backend/php/data/`: JSON persistence for messages and rate-limits

## Frontend Layout

- `public/*.html`: static pages
- `public/assets/css/`: shared styling
- `public/assets/js/core/`: shared scripts
- `public/assets/js/pages/`: page-specific logic
