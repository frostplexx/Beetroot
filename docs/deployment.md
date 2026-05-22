# Beetroot V2 Deployment Guide

This guide covers deploying Beetroot V2 using Docker or NixOS.

## Docker Deployment

### Quick Start

1. **Copy the example docker-compose file:**
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   ```

2. **Create data directory:**
   ```bash
   mkdir -p data
   ```

3. **Choose your configuration method:**

   **Option A: Config File (Recommended)**
   
   Create `data/config.yaml`:
   ```yaml
   database_path: /data/db.sqlite3
   music_directory: /music
   acoustid_api_key: YOUR_ACOUSTID_API_KEY
   lastfm_api_key: YOUR_LASTFM_API_KEY
   
   # Optional settings with defaults
   discogs_token: YOUR_DISCOGS_TOKEN
   path: '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title'
   duplicate_detection: mb_trackid
   duplicate_action: skip
   compute_file_hash: true
   conflict_resolution: keep-db
   writeback_mode: missing-only
   delete_after: 30
   reconcile_on_startup: true
   reconcile_interval: 60
   ```

   **Option B: Environment Variables**
   
   Edit `docker-compose.yml` and uncomment the environment variable section:
   ```yaml
   environment:
     DATABASE_PATH: /data/db.sqlite3
     MUSIC_DIRECTORY: /music
     ACOUSTID_API_KEY: your_key_here
     LASTFM_API_KEY: your_key_here
     # ... other variables
   ```

4. **Update the music volume path in `docker-compose.yml`:**
   ```yaml
   volumes:
     - ./data:/data
     - /path/to/your/music:/music  # ← Change this
   ```

5. **Set PUID/PGID** to match your music directory owner:
   ```bash
   # Find your user ID and group ID
   id $USER
   
   # Create .env file or set in docker-compose.yml
   echo "PUID=$(id -u)" >> .env
   echo "PGID=$(id -g)" >> .env
   ```

6. **Start the container:**
   ```bash
   docker compose up -d
   ```

7. **Access the web interface:**
   ```
   http://localhost:3000
   ```

### Configuration Reference

#### Volume Mounts

- `/data` - Application data directory (database and config file)
  - `/data/db.sqlite3` - SQLite database (created automatically)
  - `/data/config.yaml` - Configuration file (optional)
- `/music` - Music library directory (read-write access required)

#### Environment Variables

All configuration options can be set via environment variables. These override values in `config.yaml`:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CONFIG_PATH` | string | `/data/config.yaml` | Path to config file |
| `DATABASE_PATH` | string | - | SQLite database path |
| `MUSIC_DIRECTORY` | string | - | Music library path |
| `ACOUSTID_API_KEY` | string | - | AcoustID API key for fingerprinting |
| `LASTFM_API_KEY` | string | - | Last.fm API key for metadata |
| `DISCOGS_TOKEN` | string | - | Discogs API token (optional) |
| `RECONCILE_ON_STARTUP` | boolean | `true` | Run metadata sync on startup |
| `RECONCILE_INTERVAL` | number | `60` | Auto-sync interval (minutes) |
| `DUPLICATE_DETECTION` | string | `mb_trackid` | Method: `mb_trackid`, `file_hash`, or `path` |
| `DUPLICATE_ACTION` | string | `skip` | Action: `skip` or `overwrite` |
| `COMPUTE_FILE_HASH` | boolean | `true` | Enable SHA256 file hashing |
| `CONFLICT_RESOLUTION` | string | `keep-db` | Options: `keep-db`, `keep-file`, `keep-mb`, `manual` |
| `WRITEBACK_MODE` | string | `missing-only` | Options: `always`, `never`, `missing-only` |
| `PATH_TEMPLATE` | string | See below | File organization template |
| `DELETE_AFTER` | number | `30` | Trash retention (days) |

**Default PATH_TEMPLATE:**
```
%bucket{$albumartist,alpha}/$albumartist/$album/$track $title
```

#### User and Group Configuration

The container runs as a non-root user. Set `PUID` and `PGID` to match your music directory owner:

```yaml
# In docker-compose.yml or .env
PUID=1000
PGID=1000
```

This ensures the container can read and write your music files without permission issues.

#### Port Configuration

Change the external port in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # Access on port 8080
```

Or use the `BEETROOT_PORT` environment variable:
```bash
BEETROOT_PORT=8080 docker compose up -d
```

### Building from Source

Build the Docker image locally:

```bash
docker build -t beetroot-v2:local .
```

For multi-platform builds (amd64 + arm64):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t beetroot-v2:latest .
```

### Docker Commands

```bash
# Start container
docker compose up -d

# Stop container
docker compose down

# View logs
docker compose logs -f

# Restart container
docker compose restart

# Execute command in container
docker compose exec beetroot /bin/bash

# Update to latest image
docker compose pull
docker compose up -d
```

### Troubleshooting

#### Permission Denied Errors

The container user must own the music files:

```bash
# Check current ownership
ls -la /path/to/music

# Fix ownership (replace 1000:1000 with your PUID:PGID)
sudo chown -R 1000:1000 /path/to/music
```

#### Database Locked

If you see "database is locked" errors:

```bash
# Stop the container
docker compose down

# Backup the database
cp data/db.sqlite3 data/db.sqlite3.backup

# Remove WAL files
rm data/db.sqlite3-shm data/db.sqlite3-wal

# Restart
docker compose up -d
```

#### Chromaprint Binary Not Found

Verify the chromaprint binary exists in the container:

```bash
docker compose exec beetroot ls -la /app/lib/bin/chromaprint/
```

If missing, rebuild the image:
```bash
docker compose build --no-cache
```

#### Container Won't Start

Check logs for errors:
```bash
docker compose logs
```

Common issues:
- Missing or invalid API keys in config
- Music directory not accessible
- Port already in use (change `BEETROOT_PORT`)

## NixOS Deployment

### Flake-based Configuration

Add Beetroot V2 to your NixOS configuration:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    beetroot-v2.url = "github:yourusername/beetroot_v2";
  };

  outputs = { nixpkgs, beetroot-v2, ... }: {
    nixosConfigurations.myserver = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        beetroot-v2.nixosModules.default
        {
          services.beetroot-v2 = {
            enable = true;
            port = 3000;
            musicDirectory = "/srv/music";
            dataDirectory = "/var/lib/beetroot-v2";
            
            # API keys (consider using sops-nix or agenix for secrets)
            acoustidApiKey = "YOUR_API_KEY";
            lastfmApiKey = "YOUR_API_KEY";
            
            # Optional
            openFirewall = true;
          };
        }
      ];
    };
  };
}
```

### Service Management

```bash
# Start the service
sudo systemctl start beetroot-v2

# Enable on boot
sudo systemctl enable beetroot-v2

# Check status
sudo systemctl status beetroot-v2

# View logs
sudo journalctl -u beetroot-v2 -f

# Restart
sudo systemctl restart beetroot-v2

# Stop
sudo systemctl stop beetroot-v2
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable` | bool | `false` | Enable the service |
| `port` | int | `3000` | HTTP server port |
| `musicDirectory` | string | `/var/lib/music` | Music library path |
| `dataDirectory` | string | `/var/lib/beetroot-v2` | Data directory |
| `configFile` | path? | `null` | Optional config.yaml path |
| `acoustidApiKey` | string | - | AcoustID API key (required) |
| `lastfmApiKey` | string | - | Last.fm API key (required) |
| `user` | string | `beetroot` | Service user |
| `group` | string | `beetroot` | Service group |
| `openFirewall` | bool | `false` | Open firewall port |

### Using Config File with NixOS

If you prefer using a config file instead of individual options:

```nix
{
  services.beetroot-v2 = {
    enable = true;
    configFile = /etc/beetroot/config.yaml;
  };
}
```

Then manage `/etc/beetroot/config.yaml` separately (e.g., with agenix for secrets).

## Production Checklist

Before deploying to production:

- [ ] **Security**
  - [ ] Use strong, unique API keys
  - [ ] Don't commit secrets to git
  - [ ] Consider using a secrets manager (Docker: secrets, NixOS: sops-nix/agenix)
  - [ ] Set up HTTPS with reverse proxy (nginx, Traefik, Caddy)
  
- [ ] **Data**
  - [ ] Configure database backups
  - [ ] Verify music directory has adequate storage
  - [ ] Test database restore procedure
  - [ ] Set appropriate `delete_after` value for trash retention
  
- [ ] **Access**
  - [ ] Verify PUID/PGID are correct (Docker)
  - [ ] Test music file read/write permissions
  - [ ] Ensure container/service can access music directory
  
- [ ] **Monitoring**
  - [ ] Set up log monitoring
  - [ ] Configure health check alerts
  - [ ] Monitor disk space usage
  - [ ] Track container/service restarts
  
- [ ] **Performance**
  - [ ] Adjust `reconcile_interval` based on library size
  - [ ] Consider resource limits (Docker: deploy.resources)
  - [ ] Enable `compute_file_hash` only if needed (slower imports)
  
- [ ] **Networking**
  - [ ] Configure reverse proxy for HTTPS
  - [ ] Set up firewall rules
  - [ ] Test access from expected networks
  - [ ] Consider VPN or authentication proxy for remote access

## Reverse Proxy Setup

### Nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name music.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Traefik Example

```yaml
# docker-compose.yml
services:
  beetroot:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.beetroot.rule=Host(`music.example.com`)"
      - "traefik.http.routers.beetroot.entrypoints=websecure"
      - "traefik.http.routers.beetroot.tls.certresolver=letsencrypt"
      - "traefik.http.services.beetroot.loadbalancer.server.port=3000"
```

## Backup Strategy

### Database Backup

```bash
# Manual backup
docker compose exec beetroot sqlite3 /data/db.sqlite3 ".backup '/data/backup.sqlite3'"

# Or copy from host
cp data/db.sqlite3 "backup-$(date +%Y%m%d).sqlite3"
```

### Automated Backup Script

```bash
#!/bin/bash
# backup-beetroot.sh

BACKUP_DIR="/backups/beetroot"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup database
docker compose exec -T beetroot sqlite3 /data/db.sqlite3 ".backup '/data/db-backup.sqlite3'"
docker compose cp beetroot:/data/db-backup.sqlite3 "$BACKUP_DIR/db-$DATE.sqlite3"

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "db-*.sqlite3" -mtime +30 -delete
```

Add to cron:
```bash
# Daily backup at 3 AM
0 3 * * * /path/to/backup-beetroot.sh
```

## Migration from Beetroot V1

If you're migrating from the original Beetroot (V1):

### Key Differences

1. **Port**: V1 used 4433, V2 uses 3000
   - Keep same external port: `"4433:3000"` in docker-compose.yml

2. **Volumes**:
   - V1: `./config:/config` (beets config + database)
   - V2: `./data:/data` (app config + database)
   - Music: Same (`/music`)

3. **Configuration**:
   - V1: beets `config.yaml`
   - V2: App-specific `config.yaml` (different schema)
   - **Not compatible** - must create new V2 config

4. **Database**:
   - Different schemas - no automatic migration
   - V2 will re-scan music and build new database
   - Original files are preserved

### Migration Steps

1. Stop V1 container
2. Point V2 to same music directory
3. Create new V2 config.yaml
4. Start V2 - it will scan and import music
5. Verify metadata and artwork
6. Keep V1 data as backup until confirmed working

## Getting API Keys

### AcoustID

1. Visit https://acoustid.org/new-application
2. Create account and register application
3. Copy the API key

### Last.fm

1. Visit https://www.last.fm/api/account/create
2. Create API account
3. Copy the API key

### Discogs (Optional)

1. Visit https://www.discogs.com/settings/developers
2. Generate personal access token
3. Copy the token

## Support

For issues, questions, or contributions:
- GitHub Issues: [your-repo-url]
- Documentation: [your-docs-url]
