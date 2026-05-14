# Metadata API Setup

Beetroot aggregates metadata from multiple sources to provide the best recommendations:
- **MusicBrainz** (always enabled, no auth required)
- **Apple Music/iTunes** (always enabled, no auth required)  
- **Discogs** (always enabled, no auth required)
- **Spotify** (requires auth token)

## Spotify Setup (Optional)

Spotify provides high-quality metadata but requires authentication.

### Quick Setup (Temporary Token)

1. Go to https://developer.spotify.com/console/get-search-item/
2. Click "Get Token" and select the scopes (none needed for search)
3. Copy the token
4. Set environment variable:
   ```bash
   export SPOTIFY_ACCESS_TOKEN="your_token_here"
   ```
5. Restart Beetroot backend

**Note:** These tokens expire after 1 hour.

### Production Setup (Client Credentials Flow)

1. Create a Spotify app at https://developer.spotify.com/dashboard
2. Get your Client ID and Client Secret
3. Set environment variables:
   ```bash
   export SPOTIFY_CLIENT_ID="your_client_id"
   export SPOTIFY_CLIENT_SECRET="your_client_secret"
   ```
4. Restart Beetroot backend

**TODO:** Automatic token refresh is not yet implemented. For now, use the temporary token method.

## How Weighted Consensus Works

Each metadata source gets a vote for each field (album, artist, year, etc.):

- **Spotify**: 2 votes (higher weight)
- **Apple Music**: 2 votes (higher weight)
- **MusicBrainz**: 1 vote
- **Discogs**: 1 vote

The value with the most votes wins. For example:
- Spotify says: "Rock"
- Apple Music says: "Rock"  
- MusicBrainz says: "Alternative Rock"
- Discogs says: "Rock"

Result: "Rock" wins with 5 votes (2+2+1) vs "Alternative Rock" with 1 vote.

This ensures streaming services (which tend to have cleaner, more standardized metadata) have more influence on the final recommendations.
