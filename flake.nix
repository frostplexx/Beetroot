{
  description = "Beetroot Go backend + Vite frontend dev shell";

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
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        dev-script = pkgs.writeShellScriptBin "dev" ''
          set -e

          echo "🚀 Starting Beetroot development servers..."
          echo ""

          # Check if node_modules exists
          if [ ! -d "frontend/node_modules" ]; then
            echo "📦 Installing frontend dependencies..."
            cd frontend && npm install && cd ..
            echo ""
          fi

          # Trap SIGINT and SIGTERM to kill both processes
          cleanup() {
            echo ""
            echo "🛑 Shutting down servers..."
            kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
            exit 0
          }
          trap cleanup SIGINT SIGTERM

          # Start backend
          echo "🔧 Starting Go backend on http://localhost:4433..."
          cd backend
          air > ../backend.log 2>&1 &
          BACKEND_PID=$!
          cd ..

          # Start frontend
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

          # Wait for both processes
          wait $BACKEND_PID $FRONTEND_PID
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
    );
}
