# Beetroot

Go backend with Vite frontend.

## Setup

```bash
# Install dependencies (requires direnv reload after flake changes)
direnv allow

# Install frontend dependencies
cd frontend
npm install
```

## Development

### Quick Start

Simply run:

```bash
dev
```

This starts both backend and frontend servers. Press `Ctrl+C` to stop both.

- Backend runs on http://localhost:4433
- Frontend runs on http://localhost:5173

The Vite dev server proxies `/api/*` requests to the backend.

### View Logs

```bash
tail -f backend.log
tail -f frontend.log
```

### Manual Start (separate terminals)

```bash
# Terminal 1 - Backend (with hot reload)
cd backend && air

# Terminal 2 - Frontend
cd frontend && npm run dev
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/hello` - Test endpoint

## Deployment

Beetroot can be deployed as a single service with Docker or with the flake NixOS module.

- Docker image: `docker build -t beetroot .`
- Example compose file: `docker-compose.example.yml`
- NixOS module: `beetroot.nixosModules.default` with `services.beetroot.enable = true;`

See `docs/deployment.md` for complete setup, including writable music/config/library requirements.
