# Deployment

## Docker

Build and run Beetroot with the provided example Compose file:

```bash
cp docker-compose.example.yml docker-compose.yml
mkdir -p example-data/config example-data/music
cat > example-data/config/config.yaml <<'YAML'
directory: /music
library: /config/library.db
plugins: []
YAML
docker compose up --build
```

The container serves both the UI and API on port `4433` by default.

### Required writable mounts

Beetroot and beets must have read/write access to:

- `/music` (managed music files)
- `/config/config.yaml` (beets config)
- `/config/library.db` (beets library)

The example Compose file binds those paths from `./example-data/music` and `./example-data/config`.

## NixOS flake module

This flake exports `nixosModules.default`, so you can use it as an input and enable:

```nix
{
  inputs.beetroot.url = "github:frostplexx/Beetroot";

  outputs = { nixpkgs, beetroot, ... }: {
    nixosConfigurations.media = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        beetroot.nixosModules.default
        {
          services.beetroot = {
            enable = true;
            openFirewall = true;
            frontendPort = 4433;
            musicDirectory = "/srv/music";
            configDirectory = "/var/lib/beetroot/config";
            databasePath = "/srv/beets/library.db";
            extraGroups = [ "media" ];
          };
        }
      ];
    };
  };
}
```

### Service behavior

- `services.beetroot.enable = true;` runs Beetroot as a systemd service.
- The module sets writable paths for `musicDirectory`, `configDirectory`, `stateDirectory`, and (if set) `databasePath`.
- `services.beetroot.frontendPort` controls the HTTP port the bundled frontend/API is reachable on (`services.beetroot.port` remains available for compatibility).
- `services.beetroot.databasePath` lets you keep the beets `library.db` outside `configDirectory`.
- beets is executed with `BEETSCONFIG=<configDirectory>/config.yaml`.

### First start note

The default flake package compiles frontend/backend into the Beetroot state directory on first service start, then reuses the cached build.
