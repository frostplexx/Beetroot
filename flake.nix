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
              type = lib.types.str;
              description = "AcoustID API key for fingerprinting";
            };

            lastfmApiKey = lib.mkOption {
              type = lib.types.str;
              description = "Last.fm API key for metadata";
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
                ACOUSTID_API_KEY = cfg.acoustidApiKey;
                LASTFM_API_KEY = cfg.lastfmApiKey;
              } // lib.optionalAttrs (cfg.discogsToken != null) {
                DISCOGS_TOKEN = cfg.discogsToken;
              } // lib.optionalAttrs (cfg.configFile != null) {
                CONFIG_PATH = toString cfg.configFile;
              };

              serviceConfig = {
                Type = "simple";
                ExecStart = "${pkgs.bun}/bin/bun start";
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
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            sqlit-tui
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
          '';
        };
      }
    ) // {
      nixosModules.default = nixosModule;
      nixosModules.beetroot-v2 = nixosModule;
    };
}
