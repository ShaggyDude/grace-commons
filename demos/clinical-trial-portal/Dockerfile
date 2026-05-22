FROM denoland/deno:latest

WORKDIR /app

# Cache JSR/npm dependencies
# nodeModulesDir:auto means Deno manages node_modules for npm packages (Argon2id WASM)
COPY deno.json deno.lock ./
RUN deno install --frozen

# Copy source (node_modules excluded via .dockerignore; rebuilt above)
COPY . .

# Build CSS
RUN deno task css

# Create data directory (will be mounted as a persistent volume on Fly)
RUN mkdir -p /data

EXPOSE 8000

# Migrate, seed, then start
CMD deno task migrate && deno task seed && deno task start
