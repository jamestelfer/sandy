import { readdirSync, readFileSync } from "node:fs"
import { errorCode } from "./errors"

// ENOENT: the path does not exist. ENOTDIR: a parent segment exists but is a file.
// Both mean "nothing to read here"; any other failure is a real error.
const ABSENT_CODES = new Set(["ENOENT", "ENOTDIR"])

function isAbsent(error: unknown): boolean {
  const code = errorCode(error)
  return code !== undefined && ABSENT_CODES.has(code)
}

/**
 * Reads a UTF-8 file, returning undefined when the file is absent.
 * Other failures (e.g. EACCES) throw an Error naming `what`, chained via `cause`.
 */
export function readFileIfPresent(filePath: string, what: string): string | undefined {
  try {
    return readFileSync(filePath, "utf-8")
  } catch (error) {
    if (isAbsent(error)) {
      return undefined
    }
    throw new Error(`Cannot read ${what} at ${filePath}`, { cause: error })
  }
}

/**
 * Lists a directory, returning an empty array when the directory is absent.
 * Other failures (e.g. EACCES) throw an Error naming `what`, chained via `cause`.
 */
export function listDirIfPresent(dirPath: string, what: string): string[] {
  try {
    return readdirSync(dirPath)
  } catch (error) {
    if (isAbsent(error)) {
      return []
    }
    throw new Error(`Cannot read ${what} at ${dirPath}`, { cause: error })
  }
}
