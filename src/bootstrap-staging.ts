import * as fs from "node:fs/promises"

// Bootstrap file embeds — bundled into binary by Bun
import initShPath from "./bootstrap/init.sh" with { type: "file" }
import nodeCertsShPath from "./bootstrap/node_certs.sh" with { type: "file" }
import bootstrapPackageJsonPath from "./bootstrap/package.json" with { type: "file" }
import bootstrapTsconfigJsonPath from "./bootstrap/tsconfig.json" with { type: "file" }
import entrypointPath from "./bootstrap/entrypoint" with { type: "file" }
import sandyTsPath from "./bootstrap/sandy.ts" with { type: "file" }

export const NETSKOPE_CERT_PATH = "/Library/Application Support/Netskope/STAgent/data/nscacert.pem"

// Use Bun.file().arrayBuffer() instead of fs.copyFile() so this works when
// the binary is compiled — embedded bunfs paths are not accessible to the OS.
export async function copyEmbedded(src: string, dest: string): Promise<void> {
  const buf = await Bun.file(src).arrayBuffer()
  await fs.writeFile(dest, new Uint8Array(buf))
}

// Stage all bootstrap files into destDir, creating a certs/ subdirectory.
// Both backends call this with their own destDir; the Netskope cert is copied if present.
export async function stageBootstrapFiles(destDir: string): Promise<void> {
  await fs.mkdir(`${destDir}/certs`, { recursive: true })

  await Promise.all([
    copyEmbedded(initShPath, `${destDir}/init.sh`),
    copyEmbedded(nodeCertsShPath, `${destDir}/node_certs.sh`),
    copyEmbedded(bootstrapPackageJsonPath, `${destDir}/package.json`),
    copyEmbedded(bootstrapTsconfigJsonPath, `${destDir}/tsconfig.json`),
    copyEmbedded(entrypointPath, `${destDir}/entrypoint`),
    copyEmbedded(sandyTsPath, `${destDir}/sandy.ts`),
  ])

  try {
    await fs.copyFile(NETSKOPE_CERT_PATH, `${destDir}/certs/nscacert.pem`)
    process.stderr.write("sandy: Netskope certificate staged for installation\n")
  } catch {
    process.stderr.write("sandy: Netskope certificate not found, skipping\n")
  }
}
