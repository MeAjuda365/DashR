#!/bin/sh
set -e

echo "🦅 DashR starting..."

# Run migrations
echo "→ Running database migrations..."
node -e "require('./server/db/connection')" 2>&1 && echo "✓ Database ready"

# Start the server
echo "→ Starting DashR on port ${PORT:-3000}"
exec "$@"
