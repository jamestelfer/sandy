import * as fs from "node:fs/promises"
import { copyDirectoryRecursive, getEmbeddedFS } from "./embedded-fs"

export const NETSKOPE_CERT_PATH = "/Library/Application Support/Netskope/STAgent/data/nscacert.pem"

// Stage all bootstrap files into destDir, creating a certs/ subdirectory.
// Both backends call this with their own destDir; the Netskope cert is copied if present.
export async function stageBootstrapFiles(
  destDir: string,
  logger: (msg: string) => void = (msg) => process.stderr.write(msg),
): Promise<void> {
  await fs.mkdir(`${destDir}/certs`, { recursive: true })

  const memfs = await getEmbeddedFS()
  await copyDirectoryRecursive(memfs, "/bootstrap", destDir)

  try {
    await fs.copyFile(NETSKOPE_CERT_PATH, `${destDir}/certs/nscacert.pem`)
    logger("sandy: Netskope certificate staged for installation\n")
  } catch {
    // cert absent — silent
  }
}
