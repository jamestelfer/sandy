import { readFileSync } from "node:fs"
import { Readable } from "node:stream"
import { createFsFromVolume, Volume } from "memfs"
import tar from "tar-fs"
import tarPath from "../embedded.tar" with { type: "file" }

type MemFs = ReturnType<typeof createFsFromVolume>

let embeddedFsPromise: Promise<MemFs> | null = null

export function getEmbeddedFS(): Promise<MemFs> {
  if (!embeddedFsPromise) {
    embeddedFsPromise = initEmbeddedFS()
  }
  return embeddedFsPromise
}

async function initEmbeddedFS(): Promise<MemFs> {
  const volume = new Volume()
  const memfs = createFsFromVolume(volume)

  await new Promise<void>((resolve, reject) => {
    Readable.from(readFileSync(tarPath))
      .pipe(tar.extract("/", { fs: memfs as unknown as typeof import("node:fs") }))
      .on("finish", resolve)
      .on("error", reject)
  })

  return memfs
}

export function embeddedPathFromUri(uri: string): string {
  if (!uri.startsWith("sandy://")) {
    throw new Error("resource URI must start with sandy://")
  }

  const trimmed = uri.slice("sandy://".length).replace(/^\/+/, "")
  if (trimmed.length === 0) {
    throw new Error("resource URI path is empty")
  }

  return trimmed
}

function uriFromEmbeddedPath(path: string): string {
  return `sandy://${path}`
}

function listFilesRecursive(fs: MemFs, currentPath: string): string[] {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fs, entryPath))
      continue
    }
    files.push(entryPath.replace(/^\//, ""))
  }

  return files
}

export async function listEmbeddedResourceUris(): Promise<string[]> {
  const memfs = await getEmbeddedFS()
  const files = listFilesRecursive(memfs, "/")
  return files.map(uriFromEmbeddedPath).sort((a, b) => a.localeCompare(b))
}

export async function readEmbeddedResource(uri: string): Promise<string> {
  const path = embeddedPathFromUri(uri)
  const memfs = await getEmbeddedFS()
  return memfs.readFileSync(`/${path}`, "utf-8") as string
}
