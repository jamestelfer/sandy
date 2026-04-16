import { defineConfig } from "bunli"

export default defineConfig({
  name: "sandy",
  entry: "./src/main.ts",
  outdir: "./dist",
  build: {
    targets: ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"],
    compress: false,
    sourcemap: false,
  },
})
