# Stage 1: Dependencies - install packages and download chromaprint
FROM oven/bun:1-debian AS dependencies

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 make g++ curl tar \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY scripts/postinstall.js ./scripts/

RUN bun install --frozen-lockfile

# Stage 2: Builder - compile the TanStack Start / Nitro app
FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/lib/music/binaries ./lib/music/binaries

COPY . .

RUN bun run build

# Stage 3: Runtime - slim production image
FROM oven/bun:1-debian AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r beetroot && \
    useradd -r -g beetroot beetroot

# node_modules needed for native addons (flac-tagger etc.); bun:sqlite is built-in
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/lib/music/binaries ./lib/music/binaries
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/lib/music/repository/genres-tree.yaml ./lib/music/repository/genres-tree.yaml
COPY --from=builder /app/lib/music/repository/sources/lastfm_genre/genres.txt ./lib/music/repository/sources/lastfm_genre/genres.txt

RUN mkdir -p /data /music && \
    chown -R beetroot:beetroot /app /data /music

ENV NODE_ENV=production \
    PORT=3000 \
    CONFIG_PATH=/data/config.yaml

EXPOSE 3000

USER beetroot

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.ts"]
