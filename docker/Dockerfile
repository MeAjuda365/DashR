# ── DashR Dockerfile ──────────────────────────────────────────────
FROM node:20-alpine

LABEL org.opencontainers.image.title="DashR"
LABEL org.opencontainers.image.description="Orchestration control plane for OpenClaw agents"
LABEL org.opencontainers.image.licenses="MIT"

# Install build tools needed for better-sqlite3
RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY server/ ./server/
COPY public/ ./public/
COPY knexfile.js ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Run migrations on container start via entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]
