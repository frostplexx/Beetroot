# Beetroot V2

A modern music library manager built with Next.js. Beetroot helps you organize, manage, and discover your music collection with automatic metadata enrichment, album artwork, and powerful search capabilities.

## Features

- **Automatic Metadata Enrichment**: Uses AcoustID fingerprinting and MusicBrainz for accurate metadata
- **Album Artwork**: Fetches high-quality cover art from multiple sources (Last.fm, Discogs, Apple Music)
- **Smart Organization**: Flexible file organization with bucketing by artist, album, year, etc.
- **Duplicate Detection**: Multiple strategies to prevent duplicate imports
- **Background Sync**: Automatic library reconciliation and updates
- **Modern UI**: Built with Next.js 16, React 19, and Tailwind CSS

## Quick Start

### Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create configuration file:**
   ```bash
   cp config.example.yaml config.yaml
   # Edit config.yaml with your settings
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)**

### Using Nix

If you have Nix with flakes enabled:

```bash
nix develop
npm run dev
```

## Deployment

Beetroot V2 can be deployed using Docker or NixOS. See the [deployment guide](docs/deployment.md) for detailed instructions.

### Docker Quick Start

```bash
# Copy example docker-compose file
cp docker-compose.example.yml docker-compose.yml

# Create data directory and config
mkdir -p data
cat > data/config.yaml <<EOF
database_path: /data/db.sqlite3
music_directory: /music
acoustid_api_key: YOUR_KEY
lastfm_api_key: YOUR_KEY
EOF

# Edit docker-compose.yml to set your music directory
# Then start the container
docker compose up -d
```

### NixOS Deployment

Add to your NixOS configuration:

```nix
{
  services.beetroot-v2 = {
    enable = true;
    musicDirectory = "/srv/music";
    acoustidApiKey = "YOUR_KEY";
    lastfmApiKey = "YOUR_KEY";
    openFirewall = true;
  };
}
```

See [docs/deployment.md](docs/deployment.md) for complete deployment documentation.

## Configuration

Beetroot supports both file-based and environment variable configuration:

### Config File (`config.yaml`)

```yaml
database_path: ./db.sqlite3
music_directory: ~/Music/Beetroot/
acoustid_api_key: your_key
lastfm_api_key: your_key
path: '%bucket{$albumartist,alpha}/$albumartist/$album/$track $title'
duplicate_detection: mb_trackid
duplicate_action: skip
```

### Environment Variables

All config options can be set via environment variables (useful for Docker):

```bash
DATABASE_PATH=/data/db.sqlite3
MUSIC_DIRECTORY=/music
ACOUSTID_API_KEY=your_key
LASTFM_API_KEY=your_key
```

Environment variables override config file values.

## API Keys

You'll need API keys for full functionality:

- **AcoustID**: https://acoustid.org/new-application (required for fingerprinting)
- **Last.fm**: https://www.last.fm/api/account/create (required for metadata)
- **Discogs**: https://www.discogs.com/settings/developers (optional, for additional artwork)

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run clean:db     # Clean database only
npm run clean:all    # Clean database and music directory
```

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Database**: SQLite (better-sqlite3)
- **UI**: Tailwind CSS 4, Radix UI, shadcn components
- **Music Metadata**: music-metadata, chromaprint (AcoustID)
- **Audio Processing**: ffmpeg-static, flac-tagger, node-id3

## Project Structure

```
├── app/              # Next.js App Router (pages & API routes)
├── lib/              # Core library logic
│   ├── music/        # Music library management
│   ├── database/     # SQLite database layer
│   └── repository/   # Metadata reconciliation
├── components/       # React components
├── docs/             # Documentation
└── config.yaml       # Configuration file
```

## License

MIT
