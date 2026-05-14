FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.26-bookworm AS backend-build
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/beetroot .

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends beets ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=4433 \
    BEET_BIN_PATH=/usr/bin/beet \
    BEET_WORKING_DIR=/config \
    BEETSDIR=/config \
    BEETSCONFIG=/config/config.yaml \
    FRONTEND_DIST_DIR=/opt/beetroot/frontend/dist

WORKDIR /config
COPY --from=backend-build /out/beetroot /usr/local/bin/beetroot
COPY --from=frontend-build /src/frontend/dist /opt/beetroot/frontend/dist

EXPOSE 4433
ENTRYPOINT ["/usr/local/bin/beetroot"]
