# Stage 1: Dependencies - Build native modules and download chromaprint
FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

# Install build dependencies for better-sqlite3 native addon
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY scripts/postinstall.js ./scripts/

# Install dependencies (includes postinstall -> chromaprint download)
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Builder - Build Next.js application
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/lib/bin ./lib/bin

# Copy source code
COPY . .

# Build Next.js application
RUN npm run build

# Stage 3: Runtime - Slim production image
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r -g 1000 beetroot && \
    useradd -r -u 1000 -g beetroot beetroot

# Copy production dependencies and built application
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/lib/bin ./lib/bin
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/instrumentation.ts ./

# Create volume mount points
RUN mkdir -p /data /music && \
    chown -R beetroot:beetroot /app /data /music

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    CONFIG_PATH=/data/config.yaml

# Expose port
EXPOSE 3000

# Switch to non-root user
USER beetroot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["npm", "start"]
