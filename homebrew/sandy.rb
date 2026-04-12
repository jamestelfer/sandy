class Sandy < Formula
  desc "Sandboxed TypeScript execution for AWS queries via microVMs or Docker"
  homepage "https://github.com/jamestelfer/sandy"
  version "0.1.0"

  on_macos do
    on_arm do
      # TODO: update sha256 on each release
      url "https://github.com/jamestelfer/sandy/releases/download/v#{version}/sandy-darwin-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"

      def install
        bin.install "sandy-darwin-arm64" => "sandy"
      end
    end

    on_intel do
      # TODO: update sha256 on each release
      url "https://github.com/jamestelfer/sandy/releases/download/v#{version}/sandy-darwin-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"

      def install
        bin.install "sandy-darwin-x64" => "sandy"
      end
    end
  end

  test do
    assert_match "Usage: sandy", shell_output("#{bin}/sandy --help 2>&1", 1)
  end
end
