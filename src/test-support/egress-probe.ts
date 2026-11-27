import { ENV_ENDPOINT } from "../core"

export const EGRESS_PROBE_PATH = "/sandy-egress-probe"

export const EGRESS_PROBE_SCRIPT = `const res = await fetch(\`\${process.env.${ENV_ENDPOINT}}${EGRESS_PROBE_PATH}\`)
if (res.status !== 200) {
  process.exit(1)
}
console.log("[-->  egress ok")
`

export interface EgressProbe extends AsyncDisposable {
  port: number
  requests: string[]
}

export function startEgressProbe(): EgressProbe {
  const requests: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "0.0.0.0",
    fetch(req) {
      requests.push(new URL(req.url).pathname)
      return new Response("ok")
    },
  })
  const port = server.port
  if (port === undefined) {
    throw new Error("egress probe server has no port")
  }
  return {
    port,
    requests,
    [Symbol.asyncDispose]: async () => {
      await server.stop(true)
    },
  }
}
