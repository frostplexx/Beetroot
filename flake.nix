{
  description = "Beetroot Go backend + Vite frontend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      nixosModule =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        let
          cfg = config.services.beetroot;
          effectiveFrontendPort = if cfg.frontendPort != null then cfg.frontendPort else cfg.port;
        in
        {
          options.services.beetroot = {
            enable = lib.mkEnableOption "Beetroot music library service";

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.system}.default;
              defaultText = lib.literalExpression "self.packages.${pkgs.system}.default";
              description = "Beetroot package to run.";
            };

            port = lib.mkOption {
              type = lib.types.port;
              default = 4433;
              description = "TCP port used by the Beetroot HTTP server.";
            };

            frontendPort = lib.mkOption {
              type = lib.types.nullOr lib.types.port;
              default = null;
              description = "Port the bundled Beetroot frontend/API service listens on. Overrides services.beetroot.port when set.";
            };

            stateDirectory = lib.mkOption {
              type = lib.types.str;
              default = "/var/lib/beetroot";
              description = "Directory used for build cache and runtime state.";
            };

            configDirectory = lib.mkOption {
              type = lib.types.str;
              default = "/var/lib/beetroot/config";
              description = "Directory containing writable beets config and library files.";
            };

            musicDirectory = lib.mkOption {
              type = lib.types.str;
              default = "/var/lib/music";
              description = "Music directory that beetroot/beets can read and write.";
            };

            databasePath = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "Optional absolute path to the beets SQLite library database.";
            };

            user = lib.mkOption {
              type = lib.types.str;
              default = "beetroot";
              description = "User account used to run Beetroot.";
            };

            group = lib.mkOption {
              type = lib.types.str;
              default = "beetroot";
              description = "Primary group used to run Beetroot.";
            };

            extraGroups = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              default = [ ];
              description = "Supplementary groups for shared music directories.";
            };

            openFirewall = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Whether to open the Beetroot port in the firewall.";
            };

            environment = lib.mkOption {
              type = lib.types.attrsOf lib.types.str;
              default = { };
              description = "Extra environment variables passed to the service.";
            };
          };

          config = lib.mkIf cfg.enable {
            users.groups = lib.mkIf (cfg.group == "beetroot") {
              beetroot = { };
            };

            users.users = lib.mkIf (cfg.user == "beetroot") {
              beetroot = {
                isSystemUser = true;
                group = cfg.group;
                description = "Beetroot service user";
                home = cfg.stateDirectory;
                createHome = false;
              };
            };

            systemd.tmpfiles.rules =
              [
                "d ${cfg.stateDirectory} 0750 ${cfg.user} ${cfg.group} - -"
                "d ${cfg.configDirectory} 0750 ${cfg.user} ${cfg.group} - -"
              ]
              ++ lib.optional (cfg.databasePath != null) "d ${builtins.dirOf cfg.databasePath} 0750 ${cfg.user} ${cfg.group} - -";

            systemd.services.beetroot = {
              description = "Beetroot music library service";
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];
              wantedBy = [ "multi-user.target" ];

              environment = {
                PORT = toString effectiveFrontendPort;
                BEET_BIN_PATH = "${pkgs.beets}/bin/beet";
                BEET_WORKING_DIR = cfg.configDirectory;
                BEETSDIR = cfg.configDirectory;
                BEETSCONFIG = "${cfg.configDirectory}/config.yaml";
                BEETROOT_BUILD_DIR = "${cfg.stateDirectory}/build";
              }
              // lib.optionalAttrs (cfg.databasePath != null) {
                BEETROOT_DATABASE_PATH = cfg.databasePath;
                BEET_LIBRARY_PATH = cfg.databasePath;
              }
              // cfg.environment;

              serviceConfig = {
                ExecStart = "${cfg.package}/bin/beetroot";
                WorkingDirectory = cfg.configDirectory;
                User = cfg.user;
                Group = cfg.group;
                SupplementaryGroups = cfg.extraGroups;
                Restart = "on-failure";
                RestartSec = 5;
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectSystem = "strict";
                ReadWritePaths = [
                  cfg.stateDirectory
                  cfg.configDirectory
                  cfg.musicDirectory
                ] ++ lib.optional (cfg.databasePath != null) (builtins.dirOf cfg.databasePath);
              };
            };

            networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ effectiveFrontendPort ];
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        lib = pkgs.lib;
        sourceId = builtins.baseNameOf (toString self);

        beetrootPackage =
          if pkgs.stdenv.isLinux then
            pkgs.writeShellApplication {
              name = "beetroot";
              runtimeInputs = with pkgs; [
                coreutils
                findutils
                gawk
                gnugrep
                gnused
                go
                nodejs_22
                beets
              ];
              text = ''
                set -euo pipefail

                srcRoot=${self}
                cacheRoot="''${BEETROOT_BUILD_DIR:-''${XDG_CACHE_HOME:-$HOME/.cache}/beetroot/${sourceId}-${system}}"
                buildRoot="$cacheRoot/build"
                frontendSrc="$buildRoot/frontend"
                backendSrc="$buildRoot/backend"
                frontendDist="$cacheRoot/frontend-dist"
                binaryPath="$cacheRoot/beetroot"
                stampFile="$cacheRoot/source-path"
                currentSource="$srcRoot"

                if [ ! -x "$binaryPath" ] || [ ! -d "$frontendDist" ] || [ ! -f "$stampFile" ] || [ "$(cat "$stampFile")" != "$currentSource" ]; then
                  rm -rf "$buildRoot" "$frontendDist" "$binaryPath"
                  mkdir -p "$buildRoot" "$cacheRoot" "$cacheRoot/home"
                  export HOME="$cacheRoot/home"
                  export GOPATH="$cacheRoot/go"
                  export GOMODCACHE="$cacheRoot/go/pkg/mod"
                  export npm_config_cache="$cacheRoot/npm"

                  cp -R "$srcRoot/frontend" "$frontendSrc"
                  cp -R "$srcRoot/backend" "$backendSrc"
                  chmod -R u+w "$buildRoot"

                  cd "$frontendSrc"
                  npm ci
                  npm run build
                  cp -R dist "$frontendDist"

                  cd "$backendSrc"
                  go build -o "$binaryPath" .

                  printf '%s' "$currentSource" > "$stampFile"
                fi

                export FRONTEND_DIST_DIR="$frontendDist"
                : "''${BEET_BIN_PATH:=${pkgs.beets}/bin/beet}"
                export BEET_BIN_PATH
                exec "$binaryPath"
              '';
            }
          else
            null;

        dev-script = pkgs.writeShellScriptBin "dev" ''
          set -e

          echo "🚀 Starting Beetroot development servers..."
          echo ""

          if [ ! -d "frontend/node_modules" ]; then
            echo "📦 Installing frontend dependencies..."
            cd frontend && npm install && cd ..
            echo ""
          fi

          cleanup() {
            echo ""
            echo "🛑 Shutting down servers..."
            command kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
            exit 0
          }
          trap cleanup SIGINT SIGTERM

          echo "🔧 Starting Go backend on http://localhost:4433..."
          cd backend
          air > ../backend.log 2>&1 &
          BACKEND_PID=$!
          cd ..

          echo "⚛️  Starting Vite frontend on http://localhost:5173..."
          cd frontend
          npm run dev > ../frontend.log 2>&1 &
          FRONTEND_PID=$!
          cd ..

          echo ""
          echo "✅ Servers started!"
          echo "   Backend:  http://localhost:4433"
          echo "   Frontend: http://localhost:5173"
          echo ""
          echo "📋 Logs:"
          echo "   Backend:  tail -f backend.log"
          echo "   Frontend: tail -f frontend.log"
          echo ""
          echo "Press Ctrl+C to stop both servers"
          echo ""

          wait "$BACKEND_PID" "$FRONTEND_PID"
        '';

        rebuild-backend-script = pkgs.writeShellScriptBin "rebuild-backend" ''
          set -e
          echo "🔨 Rebuilding Go backend..."
          cd backend
          GOPATH="$HOME/go" \
          GOMODCACHE="$HOME/go/pkg/mod" \
          go build -o ./tmp/main .
          echo "✅ Backend rebuilt successfully!"
          echo ""
          echo "💡 Restart the dev server to use the new build"
        '';
      in
      {
        packages = lib.optionalAttrs pkgs.stdenv.isLinux {
          default = beetrootPackage;
          beetroot = beetrootPackage;
        };

        apps = lib.optionalAttrs pkgs.stdenv.isLinux {
          default = flake-utils.lib.mkApp { drv = beetrootPackage; };
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # Backend
            go
            gopls
            golangci-lint
            delve # debugger
            air # live reload

            # Frontend
            nodejs_22
            pnpm

            # Dev scripts
            dev-script
            rebuild-backend-script

            # beets excluded — nixpkgs beets pulls in aacgain which fails to
            # build on macOS; use your system beet instead (pip/pipx install)
            python3
            pipx
          ];

          shellHook = ''
            export GOPATH="$HOME/go"
            export GOMODCACHE="$HOME/go/pkg/mod"

            echo "Go $(go version | awk '{print $3}')"
            echo "Node $(node --version)"
            echo "npm $(npm --version)"
            echo ""
            echo "💡 Commands:"
            echo "   dev              - Start both backend and frontend"
            echo "   rebuild-backend  - Manually rebuild the Go backend"

            BEET_BIN=$(command -v beet 2>/dev/null)
            if [ -n "$BEET_BIN" ]; then
              export BEET_BIN
              echo ""
              echo "beet $($BEET_BIN version)"
            else
              echo ""
              echo "warn: beet not found in PATH — install via: pipx install beets"
            fi
          '';
        };
      }
    )
    // {
      nixosModules.default = nixosModule;
      nixosModules.beetroot = nixosModule;
    };
}
