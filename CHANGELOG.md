## [2.1.1] - 2026-04-03

### Security
- Container runs as non-root user via entrypoint.sh + su-exec
- Enabled Content Security Policy (CSP) with strict policy
- Webhook secret transmitted via Authorization header instead of URL query parameter
- Brute-force lockouts now persist across container restarts
- Trust proxy configurable via TRUST_PROXY environment variable