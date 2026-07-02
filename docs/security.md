# Security Notes

## Authentication

- Admin endpoints require explicit credentials through environment variables.
- No default fallback admin credentials are used.
- Supports plain password (`ADMIN_PASS`) or SHA-256 hash (`ADMIN_PASS_HASH`).
- Session cookies are `httpOnly` and `sameSite=strict`; `secure` is enabled in production.
- Optional Cloudflare Access gate can be enabled for admin routes.

## Brute-Force Controls

- Admin authentication attempts are tracked and throttled.
- Repeated failures trigger temporary blocks.
- Generic API limiter protects broad `/api` traffic while low-risk routes (health/version/telemetry) remain available for monitoring and local tooling.

## Contact Abuse Controls

- Contact submissions use server-side validation.
- Honeypot field (`website`) rejects bot-like requests.
- IP-based sliding-window rate limiting is applied.
- Idempotency handling reduces duplicate message processing during retries.

## Transport and Browser Protections

- Helmet security headers are enabled.
- CSP is applied with explicit script/style/font/connect restrictions.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, and permissions policy are enforced.
- HSTS is enabled in production.

## Telemetry and Privacy

- Telemetry payload shape is validated before storage.
- Unsupported telemetry content types are rejected.
- Client-side telemetry deduplication reduces repeated event spam.

## Operational Recommendations

- Set `ADMIN_USER` and `ADMIN_PASS_HASH` in production.
- Restrict access to admin credentials in deployment settings.
- Periodically review and rotate credentials.
- Set `ADMIN_SESSION_SECRET` explicitly in production.
- Keep `.env` and deployment secrets out of version control.
- Monitor 4xx/5xx trends and rate-limit signals.

## Security Reporting

- If you discover a vulnerability, report it privately through the repository owner contact channel before public disclosure.
