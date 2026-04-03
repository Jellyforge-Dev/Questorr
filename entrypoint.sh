#!/bin/sh
set -e

# Fix config directory ownership for mounted volumes.
# This runs as root so it works regardless of host directory permissions.
chown -R app:app /usr/src/app/config 2>/dev/null || true

# Drop privileges and execute the main process as the non-root app user.
exec su-exec app "$@"
