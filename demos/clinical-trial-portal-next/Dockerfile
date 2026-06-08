# Dockerfile — DEPLOY.md Path A: the simplest reliable image, mirroring render 1's
# proven "migrate && seed && start" boot. Path B (lean standalone) is deferred —
# see DEPLOY.md for the wrinkle (standalone output omits scripts/ + migrations/).

# ---- builder ----
FROM node:22-bookworm AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # next build (standalone output is produced but Path A runs `next start`)

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Copy the whole built app (node_modules + .next + source). This is heavier than a
# standalone image, but it lets BOTH `next start` AND the .ts migrate/seed scripts
# run without extra wiring — the scripts/ + migrations/ + lib/ + domain/ sources and
# the pglite native package are all present. (Path B trims this; see DEPLOY.md.)
COPY --from=builder /app ./
RUN mkdir -p /data
EXPOSE 3000
# Idempotent on every boot; pglite data lives on the /data volume.
CMD ["sh","-c","node scripts/migrate.ts && node scripts/seed.ts && npm run start"]
