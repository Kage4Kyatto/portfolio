# Deployment Notes

This document centralizes deployment-related guidance and points to root deployment config files.

## Deployment Config Files

These files intentionally stay at the repository root because hosting platforms discover them there:

- `render.yaml` (Render config)
- `railway.json` (Railway config)

## Render

1. Push this repository to GitHub.
2. Create a PHP web service in Render.
3. Set publish directory to `public`.
4. Configure environment variables:
   - `ADMIN_USER`
   - `ADMIN_PASS` or `ADMIN_PASS_HASH`
   - Optional email settings: `CONTACT_NOTIFY_TO`, `CONTACT_NOTIFY_FROM`, `RESEND_API_KEY`

## Railway

1. Push this repository to GitHub.
2. Create a new project in Railway from the repository.
3. Use a PHP runtime setup (or Docker) with document root at `public`.
4. Configure environment variables:
   - `ADMIN_USER`
   - `ADMIN_PASS` or `ADMIN_PASS_HASH`
   - Optional email settings: `CONTACT_NOTIFY_TO`, `CONTACT_NOTIFY_FROM`, `RESEND_API_KEY`

## Local Validation Before Deploy

- Install dependencies: `npm install`
- Syntax checks: `npm run lint`
- Tests: `npm test`
