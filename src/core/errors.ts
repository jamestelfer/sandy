/**
 * Extracts the errno code (e.g. "ENOENT", "EACCES") from a thrown value.
 * Returns undefined for non-Error values and Errors without a string code.
 */
export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined
}

/**
 * Extracts the HTTP status code (e.g. 404) from a thrown value, as set by
 * HTTP clients such as dockerode. Returns undefined for non-Error values and
 * Errors without a numeric statusCode.
 */
export function errorStatusCode(error: unknown): number | undefined {
  return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : undefined
}

/**
 * Renders a thrown value as a single line, following the `cause` chain.
 * Depth is capped so cyclic causes cannot recurse forever.
 */
export function describeError(error: unknown, depth = 5): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  if (error.cause !== undefined && depth > 0) {
    return `${error.message}: ${describeError(error.cause, depth - 1)}`
  }
  return error.message
}
