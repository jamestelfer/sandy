// Files imported with { type: "file" } resolve to an embedded path at build time.
declare module "*.tar" {
  const path: string
  export default path
}

declare module "*/Dockerfile" {
  const path: string
  export default path
}
