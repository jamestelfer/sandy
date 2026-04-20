import { readFileSync } from "node:fs"
import type * as nodeFsTypes from "node:fs"
import * as nodeFs from "node:fs/promises"
import { Readable } from "node:stream"
import { createFsFromVolume, Volume } from "memfs"
import tar from "tar-fs"
import type { ExtractOptions } from "tar-fs"
import tarPath from "../embedded.tar" with { type: "file" }

type MemFs = ReturnType<typeof createFsFromVolume>

// Methods tar-fs extract calls on opts.fs at runtime.
// Derived from tar-fs source inspection.
const TAR_EXTRACT_FS_METHODS = [
  "mkdir",
  "createWriteStream",
  "symlink",
  "link",
  "unlink",
  "chmod",
  "chown",
  "stat",
  "lstat",
  "utimes",
  "realpath",
] as const

type TarExtractFs = Pick<typeof nodeFsTypes, (typeof TAR_EXTRACT_FS_METHODS)[number]>

function isTarExtractFs(candidate: unknown): candidate is TarExtractFs {
  if (candidate == null || typeof candidate !== "object") {
    return false
  }
  const obj: Record<string, unknown> = candidate as Record<string, unknown>
  return TAR_EXTRACT_FS_METHODS.every((fn) => typeof obj[fn] === "function")
}

function isString(value: string | Buffer): value is string {
  return typeof value === "string"
}

function isBuffer(value: string | Buffer): value is Buffer {
  return Buffer.isBuffer(value)
}

function assertStringName(entry: { name: string | Buffer }): asserts entry is { name: string } {
  if (typeof entry.name !== "string") {
    throw new Error("expected string directory entry name")
  }
}

function memoize<T>(factory: () => T): () => T {
  let cached: T | undefined
  return () => {
    if (cached === undefined) {
      cached = factory()
    }
    return cached
  }
}

export const getEmbeddedFS: () => Promise<MemFs> = memoize(() => initEmbeddedFS())

async function initEmbeddedFS(): Promise<MemFs> {
  const volume = new Volume()
  const memfs = createFsFromVolume(volume)

  if (!isTarExtractFs(memfs)) {
    throw new Error("memfs does not satisfy tar-fs extract filesystem contract")
  }

  await new Promise<void>((resolve, reject) => {
    Readable.from(readFileSync(tarPath))
      .pipe(tar.extract("/", { fs: memfs } as ExtractOptions & { fs: TarExtractFs }))
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
    assertStringName(entry)
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
  try {
    const raw = memfs.readFileSync(`/${path}`, "utf-8")
    if (!isString(raw)) {
      throw new Error(`expected string content for ${uri}, got Buffer`)
    }
    return raw
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`embedded resource not found: ${uri}`)
    }
    throw err
  }
}

// Recursively copy a directory from a memfs source to a real filesystem destination.
// Source entries are read from the memfs instance; destination files are written
// via node:fs/promises. Throws if the source path does not exist.
export async function copyDirectoryRecursive(
  sourceFs: MemFs,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const entries = sourceFs.readdirSync(sourcePath, { withFileTypes: true })

  for (const entry of entries) {
    assertStringName(entry)
    const srcEntry = sourcePath === "/" ? `/${entry.name}` : `${sourcePath}/${entry.name}`
    const destEntry = `${destPath}/${entry.name}`

    if (entry.isDirectory()) {
      await nodeFs.mkdir(destEntry, { recursive: true })
      await copyDirectoryRecursive(sourceFs, srcEntry, destEntry)
    } else {
      const raw = sourceFs.readFileSync(srcEntry)
      if (!isBuffer(raw)) {
        throw new Error(`expected Buffer content for ${srcEntry}, got string`)
      }
      await nodeFs.writeFile(destEntry, raw)
    }
  }
}
