{
  description = "Sandboxed TypeScript runtime for AI coding agents to query AWS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    imds-broker.url = "github:jamestelfer/imds-broker";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    imds-broker,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      imds-broker-pkg = imds-broker.packages.${system}.default;
    in {
      packages = {
        sandy = pkgs.stdenv.mkDerivation {
          pname = "sandy";
          version = "0.6.1"; # x-release-please-version

          src = ./.;

          nativeBuildInputs = with pkgs; [
            bun
            nodejs
            makeWrapper
          ];

          buildPhase = ''
            runHook preBuild

            export HOME=$TMPDIR

            bun install --frozen-lockfile
            bun scripts/pack-embedded.ts
            bun build --compile --target=bun src/main.ts --outfile dist/sandy

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out/bin
            cp dist/sandy $out/bin/sandy

            wrapProgram $out/bin/sandy \
              --suffix PATH : ${pkgs.lib.makeBinPath [imds-broker-pkg]}

            runHook postInstall
          '';

          meta = {
            description = "Sandboxed TypeScript runtime for AI coding agents to query AWS";
            homepage = "https://github.com/jamestelfer/sandy";
            license = pkgs.lib.licenses.asl20;
            mainProgram = "sandy";
          };
        };

        default = self.packages.${system}.sandy;
      };
    });
}
