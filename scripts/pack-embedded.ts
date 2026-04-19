import { createWriteStream, existsSync } from "node:fs"
import { resolve } from "node:path"
import tar from "tar-fs"

const sourceDir = resolve(import.meta.dir, "../embedded")
const archivePath = resolve(import.meta.dir, "../embedded.tar")

if (!existsSync(sourceDir)) {
  console.error(`embedded source directory not found: ${sourceDir}`)
  process.exit(1)
}

await new Promise<void>((resolvePromise, rejectPromise) => {
  tar
    .pack(sourceDir)
    .pipe(createWriteStream(archivePath))
    .on("finish", resolvePromise)
    .on("error", rejectPromise)
})
