FROM denoland/deno:latest

WORKDIR /app

# Cache dependencies
COPY deno.json deno.lock ./
RUN deno install --frozen

# Copy source
COPY . .

# Build CSS
RUN deno task build:css

# Create data directory (will be mounted as a persistent volume on Fly)
RUN mkdir -p data

EXPOSE 8000

# Migrate, seed, then start
CMD deno run -A src/db/migrate.ts && deno run -A src/db/seed.ts && deno run -A src/main.ts
