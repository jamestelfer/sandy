interface TypeMap {
  string: string
  number: number
  boolean: boolean
  bigint: bigint
  symbol: symbol
  undefined: undefined
  object: object
  // A runtime check cannot see parameters, so callers get unknown in and out.
  function: (...args: unknown[]) => unknown
}

export type TypeName = keyof TypeMap

type Spec = Record<string, TypeName>

type RequiredFields<S extends Spec> = {
  [K in keyof S as K extends `${string}?` ? never : K]: TypeMap[S[K]]
}
type OptionalFields<S extends Spec> = {
  [K in keyof S as K extends `${infer Base}?` ? Base : never]?: TypeMap[S[K]]
}
export type ShapeOf<S extends Spec> = RequiredFields<S> & OptionalFields<S>

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null
}

function is<T extends TypeName>(value: unknown, type: T): value is TypeMap[T] {
  return type === "object" ? isObject(value) : typeof value === type
}

function has<V, K extends PropertyKey, T extends TypeName>(
  value: V,
  key: K,
  type: T,
): value is V & Record<K, TypeMap[T]> {
  return isObject(value) && key in value && is(Reflect.get(value, key), type)
}

function get<T extends TypeName>(
  value: unknown,
  key: PropertyKey,
  type: T,
): TypeMap[T] | undefined {
  if (!isObject(value)) {
    return undefined
  }
  const field: unknown = Reflect.get(value, key)
  return is(field, type) ? field : undefined
}

function of<const S extends Spec>(spec: S): (value: unknown) => value is ShapeOf<S> {
  const fields = Object.entries(spec).map(([key, type]) =>
    key.endsWith("?")
      ? { key: key.slice(0, -1), type, optional: true }
      : { key, type, optional: false },
  )
  return (value: unknown): value is ShapeOf<S> =>
    isObject(value) &&
    fields.every(({ key, type, optional }) => {
      const field: unknown = Reflect.get(value, key)
      return optional && field === undefined ? true : key in value && is(field, type)
    })
}

export const shape = { isObject, is, has, get, of }
