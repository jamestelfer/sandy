import type * as nodeFsTypes from "node:fs"
import { readFileSync } from "node:fs"
import * as nodeFs from "node:fs/promises"
import { Readable } from "node:stream"
import { createFsFromVolume, Volume } from "memfs"
import type { ExtractOptions } from "tar-fs"
import tar from "tar-fs"
import tarPath from "../../embedded.tar" with { type: "file" }
import { errorCode } from "../core"

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
  if (candidate === null || candidate === undefined || typeof candidate !== "object") {
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
  return extractTarBufferToMemfs(readFileSync(tarPath))
}

// tar-fs's underlying tar-stream Extract can emit "finish" before every
// mkdir/write/chmod it triggered against the destination fs has actually
// settled (an interop timing quirk between streamx and Node streams that
// shows up once the destination's async callbacks resolve fast enough to
// race ahead of it — memfs is fast enough to hit this on large archives).
// Wrap the destination fs in a Proxy that tracks every in-flight operation
// tar-fs triggers, so extraction can wait for them all to settle before
// handing back the volume.
function withDrainTracking(fs: TarExtractFs): {
  fs: TarExtractFs
  whenDrained: () => Promise<void>
} {
  let pending = 0
  let waiters: Array<() => void> = []

  function settle() {
    pending -= 1
    if (pending === 0) {
      const toResolve = waiters
      waiters = []
      for (const resolve of toResolve) {
        resolve()
      }
    }
  }

  function whenDrained(): Promise<void> {
    if (pending === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => waiters.push(resolve))
  }

  function isCallback(value: unknown): value is (...cbArgs: unknown[]) => void {
    return typeof value === "function"
  }

  // tar-fs always passes a trailing callback for these methods (see
  // TAR_EXTRACT_FS_METHODS), but guard the assumption explicitly rather than
  // casting: if a future call has no callback in the last position, skip
  // tracking it instead of wrapping something that isn't a function.
  function trackCallbackStyle(
    args: unknown[],
    callback: (...cbArgs: unknown[]) => void,
  ): unknown[] {
    return [
      ...args.slice(0, -1),
      (...cbArgs: unknown[]) => {
        settle()
        callback(...cbArgs)
      },
    ]
  }

  // Settles as soon as the stream itself finishes, which is before tar-fs's
  // subsequent metadata calls (utimes/chmod) for the same entry begin — so
  // `pending` can briefly touch zero while those metadata operations are
  // still in flight. That's fine for sandy: file content is fully flushed by
  // the time "finish" fires, and callers only ever read file content off the
  // returned volume, never permissions or timestamps. Don't reorder settle()
  // to run after metadata completion without re-verifying that still holds.
  function trackWriteStream(stream: nodeFsTypes.WriteStream): nodeFsTypes.WriteStream {
    let settled = false
    const settleOnce = () => {
      if (settled) {
        return
      }
      settled = true
      settle()
    }
    stream.on("finish", settleOnce)
    stream.on("close", settleOnce)
    stream.on("error", settleOnce)
    return stream
  }

  const tracked = new Proxy(fs, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== "function") {
        return value
      }

      const method = value as (...args: unknown[]) => unknown

      return (...args: unknown[]) => {
        if (prop === "createWriteStream") {
          pending += 1
          return trackWriteStream(method.apply(target, args) as nodeFsTypes.WriteStream)
        }

        const callback = args[args.length - 1]
        if (!isCallback(callback)) {
          return method.apply(target, args)
        }

        pending += 1
        return method.apply(target, trackCallbackStyle(args, callback))
      }
    },
  })

  return { fs: tracked, whenDrained }
}

export async function extractTarBufferToMemfs(tarBuffer: Buffer): Promise<MemFs> {
  const volume = new Volume()
  const memfs = createFsFromVolume(volume)

  if (!isTarExtractFs(memfs)) {
    throw new Error("memfs does not satisfy tar-fs extract filesystem contract")
  }

  const { fs: trackedFs, whenDrained } = withDrainTracking(memfs)

  await new Promise<void>((resolve, reject) => {
    Readable.from(tarBuffer)
      .pipe(tar.extract("/", { fs: trackedFs } as ExtractOptions & { fs: TarExtractFs }))
      .on("finish", resolve)
      .on("error", reject)
  })

  await whenDrained()

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
    if (errorCode(err) === "ENOENT") {
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
