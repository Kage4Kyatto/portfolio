# Full-Stack Portfolio Website

This project contains a 5-page portfolio frontend and a PHP backend API.

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

## Run Locally

1. Ensure PHP is installed.
2. Ensure Node.js is installed (for JavaScript tests and CI parity).
3. Set environment variables for admin auth:
   - `ADMIN_USER=...`
   - `ADMIN_PASS=...`
   - Optional hash alternative: `ADMIN_PASS_HASH=<sha256-hex>`
4. Start local PHP server from project root:
   - `php -S localhost:8000 -t public`
5. Open:
   - `http://localhost:8000`

## Security Notes

- Admin authentication now requires explicit env vars. No fallback credentials are used.
- Admin login attempts are throttled and temporarily blocked after repeated failures.
- Contact submissions have stricter validation and IP-based sliding-window rate limiting.

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

- Added canonical and robots meta tags, OG URL metadata, and deferred script loading.
- Added `public/robots.txt` and `public/sitemap.xml`.
- Update `https://example.com` inside `public/sitemap.xml` to your real deployed domain.

## Tests and CI

- Install dependencies: `npm install`
- Run lint checks: `npm run lint`
- Run tests: `npm test`
- GitHub Actions workflow added at `.github/workflows/ci.yml` to run lint + test on pushes and pull requests.

## API Endpoints

- `GET /api/health.php`
- `GET /api/messages.php` (requires Basic auth with `ADMIN_USER` and `ADMIN_PASS` or `ADMIN_PASS_HASH`)
- `POST /api/contact.php`

## Admin Dashboard

- URL: `/admin.html`
- Enter admin username and password to load submissions.
- Contact form submissions are stored in `backend/php/data/messages.json`.
- Includes client-side search, pagination, and CSV export for loaded messages.

### Password Hash Option

- You can set `ADMIN_PASS_HASH` (SHA-256 hex string) and keep `ADMIN_PASS` empty.
- Generate SHA-256 in PowerShell:
   - `[Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("your-password"))).ToLower()`

## Deployment

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
