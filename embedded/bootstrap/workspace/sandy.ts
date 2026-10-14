import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { nanoid } from "nanoid"

export function progress(message: string): void {
  process.stdout.write(`[--> ${message}\n`)
}

// ---------------------------------------------------------------------------
// Async iterator helpers
//
// Node has no built-in helpers for async iterables yet. These follow the
// names and semantics of the TC39 Async Iterator Helpers proposal
// (https://github.com/tc39/proposal-async-iterator-helpers) and, for `chunks`,
// the Iterator Chunking proposal
// (https://github.com/tc39/proposal-iterator-chunking) as standalone
// functions, so they compose with any async generator — including AWS SDK
// `paginateX()` results — without patching prototypes.
//
// All helpers are lazy: nothing is pulled from the source until the result is
// iterated, and items are processed one at a time. Breaking out of a
// `for await` loop (or `take` reaching its limit) closes the source, so no
// further AWS calls are made.
//
//   for await (const svc of take(filter(listServices(c), isProd), 20)) { ... }
// ---------------------------------------------------------------------------

/** Any source a helper can consume: async generators, SDK paginators, arrays. */
export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>

/**
 * Transform each item. `fn` may be async; it is awaited before the next item
 * is pulled. `index` counts items from 0.
 *
 * @example
 * const names = map(listServices(cluster), (svc) => svc.serviceName ?? "unknown")
 */
export async function* map<T, U>(
  source: AnyIterable<T>,
  fn: (item: T, index: number) => U | Promise<U>,
): AsyncGenerator<U, void, undefined> {
  let index = 0
  for await (const item of source) {
    yield await fn(item, index++)
  }
}

/**
 * Keep only items for which `predicate` returns true. `predicate` may be async.
 * Pass a type guard to narrow the item type.
 *
 * @example
 * const running = filter(listInstances(ec2), (i) => i.State?.Name === "running")
 * const withIds = filter(listInstances(ec2), (i): i is Instance & { InstanceId: string } =>
 *   i.InstanceId !== undefined)
 */
export function filter<T, S extends T>(
  source: AnyIterable<T>,
  predicate: (item: T, index: number) => item is S,
): AsyncGenerator<S, void, undefined>
export function filter<T>(
  source: AnyIterable<T>,
  predicate: (item: T, index: number) => boolean | Promise<boolean>,
): AsyncGenerator<T, void, undefined>
export async function* filter<T>(
  source: AnyIterable<T>,
  predicate: (item: T, index: number) => boolean | Promise<boolean>,
): AsyncGenerator<T, void, undefined> {
  let index = 0
  for await (const item of source) {
    if (await predicate(item, index++)) {
      yield item
    }
  }
}

/**
 * Map each item to an iterable (sync or async) and yield its items in order.
 * Use it to expand one item into many, such as a cluster into its services. Each
 * inner iterable is drained before the next source item is pulled.
 *
 * @example
 * const allServices = flatMap(listClusterArns(ecs), (arn) => listServices(ecs, arn))
 */
export async function* flatMap<T, U>(
  source: AnyIterable<T>,
  fn: (item: T, index: number) => AnyIterable<U> | Promise<AnyIterable<U>>,
): AsyncGenerator<U, void, undefined> {
  let index = 0
  for await (const item of source) {
    yield* await fn(item, index++)
  }
}

/**
 * Consume the whole source in non-overlapping groups of `size` items. The final
 * group may be shorter. Use it when a bulk API takes a limited number of inputs
 * per call. Batch size is chosen here, independent of how the source paginates.
 * Follows the TC39 Iterator Chunking proposal's `chunks(size)`.
 *
 * @throws {RangeError} if `size` is not a positive integer.
 *
 * @example
 * // DescribeServices accepts at most 10 services per call
 * for await (const arns of chunks(listServiceArns(cluster), 10)) {
 *   await ecs.send(new DescribeServicesCommand({ cluster, services: arns }))
 * }
 */
export async function* chunks<T>(
  source: AnyIterable<T>,
  size: number,
): AsyncGenerator<T[], void, undefined> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunks: size must be a positive integer, got ${size}`)
  }
  let group: T[] = []
  for await (const item of source) {
    group.push(item)
    if (group.length === size) {
      yield group
      group = []
    }
  }
  if (group.length > 0) {
    yield group
  }
}

/**
 * Yield at most `limit` items, then stop and close the source. Use it to cap
 * AWS calls while exploring: pages beyond what is needed are never fetched.
 *
 * @throws {RangeError} if `limit` is negative or NaN.
 *
 * @example
 * for await (const bucket of take(listBuckets(s3), 5)) { ... }
 */
export async function* take<T>(
  source: AnyIterable<T>,
  limit: number,
): AsyncGenerator<T, void, undefined> {
  if (Number.isNaN(limit) || limit < 0) {
    throw new RangeError(`take: limit must be a non-negative number, got ${limit}`)
  }
  if (limit === 0) {
    return
  }
  let remaining = limit
  for await (const item of source) {
    yield item
    if (--remaining <= 0) {
      return
    }
  }
}

/**
 * Input shape accepted by `Evidence.append`.
 *
 * `summary` is a guideline ≤ 20 words; the runtime does not enforce length.
 * `dataFile` is a path relative to `process.env.SANDY_OUTPUT`; existence is
 * not validated at append time (the script owns the write ordering).
 */
export type EvidenceInput = {
  hypotheses: string[]
  summary: string
  dataFile?: string
}

/**
 * Persisted shape. One JSON object per line in `$SANDY_OUTPUT/evidence.jsonl`.
 */
export type EvidenceEntry = EvidenceInput & {
  id: string
  timestamp: string
}

/**
 * Append-only evidence log written to `$SANDY_OUTPUT/evidence.jsonl`.
 * Each entry links a finding to one or more hypothesis IDs so the agent can
 * trace which data supports or refutes which hypotheses.
 */
export class Evidence {
  public static append(input: EvidenceInput): void {
    if (!Array.isArray(input?.hypotheses)) {
      throw new Error(
        "evidence.append: hypotheses must be an array of hypothesis ids (string[])",
      )
    }

    const entry = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      ...input,
    } satisfies EvidenceEntry

    const line = `${JSON.stringify(entry)}\n`
    appendFileSync(join(process.env.SANDY_OUTPUT ?? "", "evidence.jsonl"), line)

    const marker = input.dataFile ?? "-"
    progress(`evidence[${input.hypotheses.join(",")}] ${marker} — ${input.summary}`)
  }
}
