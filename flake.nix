{
  description = "Beetroot V2 - Next.js music library manager";

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
      # NixOS module for deployment
      nixosModule = { config, lib, pkgs, ... }:
        let
          cfg = config.services.beetroot-v2;
          # Use the built package from the same flake
          beetroot-package = self.packages.${pkgs.system}.default or (
            let
              fallbackNodeModules = pkgs.stdenv.mkDerivation {
                name = "beetroot-v2-node-modules";
                src = pkgs.lib.fileset.toSource {
                  root = ./.;
                  fileset = pkgs.lib.fileset.unions [
                    ./package.json
                    ./bun.lock
                  ];
                };
                nativeBuildInputs = [ pkgs.bun ];
                dontFixup = true;
                buildPhase = ''
                  export HOME=$TMPDIR
                  bun install --frozen-lockfile --ignore-scripts
                '';
                installPhase = ''
                  mkdir $out
                  cp -r node_modules $out/
                '';
                outputHashAlgo = "sha256";
                outputHashMode = "recursive";
                outputHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
              };
            in pkgs.stdenv.mkDerivation {
              pname = "beetroot-v2";
              version = "0.1.0";
              src = ./.;
              nativeBuildInputs = [ pkgs.bun ];
              buildInputs = [ pkgs.chromaprint ];
              buildPhase = ''
                export HOME=$TMPDIR
                cp -r ${fallbackNodeModules}/node_modules ./node_modules
                chmod -R u+w ./node_modules
                bun run build
              '';
              installPhase = ''
                mkdir -p $out
                cp -r .output node_modules $out/
                cp package.json $out/
                mkdir -p $out/lib/music/binaries/chromaprint
                ln -sf ${pkgs.chromaprint}/bin/fpcalc $out/lib/music/binaries/chromaprint/fpcalc
                cat > $out/start.sh <<EOF
#!/bin/sh
cd $out
exec ${pkgs.bun}/bin/bun run .output/server/index.mjs "\$@"
EOF
                chmod +x $out/start.sh
              '';
            }
          );
        in {
          options.services.beetroot-v2 = {
            enable = lib.mkEnableOption "Beetroot v2 music library service";

            port = lib.mkOption {
              type = lib.types.port;
              default = 3000;
              description = "TCP port for the web interface";
            };

            musicDirectory = lib.mkOption {
              type = lib.types.str;
              default = "/var/lib/music";
              description = "Music directory path";
            };

            dataDirectory = lib.mkOption {
              type = lib.types.str;
              default = "/var/lib/beetroot-v2";
              description = "Directory for database and config";
            };

            configFile = lib.mkOption {
              type = lib.types.nullOr lib.types.path;
              default = null;
              description = "Path to config.yaml (optional if using environment variables)";
            };

            acoustidApiKey = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "AcoustID API key for fingerprinting (optional if using configFile)";
            };

            lastfmApiKey = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "Last.fm API key for metadata (optional if using configFile)";
            };

            discogsToken = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "Discogs API token (optional)";
            };

            user = lib.mkOption {
              type = lib.types.str;
              default = "beetroot";
              description = "User to run the service";
            };

            group = lib.mkOption {
              type = lib.types.str;
              default = "beetroot";
              description = "Group to run the service";
            };

            openFirewall = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Open firewall port";
            };
          };

          config = lib.mkIf cfg.enable {
            users.groups = lib.mkIf (cfg.group == "beetroot") {
              beetroot = {};
            };

            users.users = lib.mkIf (cfg.user == "beetroot") {
              beetroot = {
                isSystemUser = true;
                group = cfg.group;
                description = "Beetroot v2 service user";
                home = cfg.dataDirectory;
              };
            };

            systemd.tmpfiles.rules = [
              "d ${cfg.dataDirectory} 0750 ${cfg.user} ${cfg.group} - -"
              "d ${cfg.musicDirectory} 0755 ${cfg.user} ${cfg.group} - -"
            ];

            systemd.services.beetroot-v2 = {
              description = "Beetroot v2 music library service";
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];
              wantedBy = [ "multi-user.target" ];

              environment = {
                NODE_ENV = "production";
                PORT = toString cfg.port;
                DATABASE_PATH = "${cfg.dataDirectory}/db.sqlite3";
                MUSIC_DIRECTORY = cfg.musicDirectory;
              } // lib.optionalAttrs (cfg.acoustidApiKey != null) {
                ACOUSTID_API_KEY = cfg.acoustidApiKey;
              } // lib.optionalAttrs (cfg.lastfmApiKey != null) {
                LASTFM_API_KEY = cfg.lastfmApiKey;
              } // lib.optionalAttrs (cfg.discogsToken != null) {
                DISCOGS_TOKEN = cfg.discogsToken;
              } // lib.optionalAttrs (cfg.configFile != null) {
                CONFIG_PATH = toString cfg.configFile;
              };

              serviceConfig = {
                Type = "simple";
                ExecStart = "${beetroot-package}/start.sh";
                WorkingDirectory = cfg.dataDirectory;
                User = cfg.user;
                Group = cfg.group;
                Restart = "on-failure";
                RestartSec = "5s";

                # Security hardening
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                ReadWritePaths = [
                  cfg.dataDirectory
                  cfg.musicDirectory
                ];
                ProtectKernelTunables = true;
                ProtectKernelModules = true;
                ProtectControlGroups = true;
                RestrictRealtime = true;
                RestrictSUIDSGID = true;
                MemoryDenyWriteExecute = false; # Node.js needs this
                LockPersonality = true;
              };
            };

            networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Pre-fetch node_modules in a fixed-output derivation (has network access).
        # dontFixup prevents patchShebangs from embedding nix store paths in the
        # output, which would violate the FOD content-address constraint.
        # --ignore-scripts skips postinstall (which would download chromaprint),
        # keeping the FOD free of store-path references from nativeBuildInputs.
        nodeModules = pkgs.stdenv.mkDerivation {
          name = "beetroot-v2-node-modules";
          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./package.json
              ./bun.lock
            ];
          };
          nativeBuildInputs = [ pkgs.bun ];
          dontFixup = true;
          buildPhase = ''
            export HOME=$TMPDIR
            bun install --frozen-lockfile --ignore-scripts
          '';
          installPhase = ''
            mkdir $out
            cp -r node_modules $out/
          '';
          outputHashAlgo = "sha256";
          outputHashMode = "recursive";
          outputHash = "sha256-nUdwgi5vejx3DJeIMuw2T5Bx13GwqA+824120bj6oRU=";
        };

        beetroot-v2 = pkgs.stdenv.mkDerivation {
          pname = "beetroot-v2";
          version = "0.1.0";

          src = ./.;

          nativeBuildInputs = [ pkgs.bun ];

          buildInputs = with pkgs; [
            chromaprint
          ];

          buildPhase = ''
            export HOME=$TMPDIR
            cp -r ${nodeModules}/node_modules ./node_modules
            chmod -R u+w ./node_modules
            bun run build
          '';

          installPhase = ''
            mkdir -p $out

            cp -r .output $out/
            cp -r node_modules $out/
            cp package.json $out/

            mkdir -p $out/lib/music/binaries/chromaprint
            ln -sf ${pkgs.chromaprint}/bin/fpcalc $out/lib/music/binaries/chromaprint/fpcalc

            cat > $out/start.sh <<EOF
#!/bin/sh
cd $out
exec ${pkgs.bun}/bin/bun run .output/server/index.mjs "\$@"
EOF
            chmod +x $out/start.sh
          '';

          meta = with pkgs.lib; {
            description = "Beetroot v2 - Next.js music library manager";
            license = licenses.mit;
            platforms = platforms.unix;
          };
        };
      in {
        packages.default = beetroot-v2;
        packages.beetroot-v2 = beetroot-v2;

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            sqlite
          ] ++ lib.optionals stdenv.isLinux [
            # Audio fingerprinting tools (optional, only on Linux where they build reliably)
            chromaprint
          ];

          shellHook = ''
            echo "Beetroot v2 Development Environment"
            echo "===================================="
            echo "Bun: $(bun --version)"
            echo ""
            echo "Commands:"
            echo "  bun run dev   - Start development server"
            echo "  bun run build - Build for production"
            echo "  bun start     - Start production server"
            echo ""
            echo "Note: Audio fingerprinting requires fpcalc (chromaprint)"
            echo "      Install separately on macOS: brew install chromaprint"
            echo ""
          '';
        };
      }
    ) // {
      nixosModules.default = nixosModule;
      nixosModules.beetroot-v2 = nixosModule;
    };
}
