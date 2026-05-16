{
  description = "Beetroot";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      system = "aarch64-darwin"; # change to x86_64-darwin or x86_64-linux
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [ nodejs yarn sqlit-tui ];

        shellHook = "";
      };
    };
}
