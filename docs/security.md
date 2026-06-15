# Security Notes

## Authentication

- Admin endpoints require explicit credentials through environment variables.
- No default fallback admin credentials are used.
- Supports plain password (`ADMIN_PASS`) or SHA-256 hash (`ADMIN_PASS_HASH`).

## Brute-Force Controls

- Admin authentication attempts are tracked and throttled.
- Repeated failures trigger temporary blocks.

## Contact Abuse Controls

- Contact submissions use server-side validation.
- Honeypot field (`website`) rejects bot-like requests.
- IP-based sliding-window rate limiting is applied.

## Operational Recommendations

- Set `ADMIN_USER` and `ADMIN_PASS_HASH` in production.
- Restrict access to admin credentials in deployment settings.
- Periodically review and rotate credentials.
