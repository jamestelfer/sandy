import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { getEmbeddedFS } from "./embedded-fs"

const CHECK_NAMES = ["baseline", "connect"] as const

export async function extractEmbeddedChecks(destDir: string): Promise<void> {
  const memfs = await getEmbeddedFS()
  for (const name of CHECK_NAMES) {
    const data = memfs.readFileSync(`/checks/${name}.ts`)
    if (!Buffer.isBuffer(data)) {
      throw new Error(`expected Buffer content for /checks/${name}.ts, got string`)
    }
    await writeFile(join(destDir, `${name}.ts`), data)
  }
}
