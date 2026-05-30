FROM denoland/deno:latest

WORKDIR /app

# Cache JSR/npm dependencies against the committed lockfile
COPY deno.json deno.lock ./
RUN deno install --frozen

# Copy source (node_modules excluded via .dockerignore; rebuilt above)
COPY . .

# Build Tailwind CSS -> public/styles.css (served by app.ts)
RUN deno task build:css

# Persistent volume mount point on Fly (SQLite lives here)
RUN mkdir -p /data

EXPOSE 8000

# Migrate schema, seed demo data, then start. Mirrors the Beacon demo's CMD.
# (No "start" task in deno.json, so main.ts is run directly with -A.)
CMD deno task migrate && deno task seed && deno run -A src/main.ts
