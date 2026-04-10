import type { RunOptions } from "./types"
import {
  DEFAULT_REGION,
  ENV_ENDPOINT,
  ENV_ENDPOINT_MODE,
  ENV_ENDPOINT_MODE_VALUE,
  ENV_REGION,
  ENV_SANDY_OUTPUT,
  ENV_V1_DISABLED,
  ENV_V1_DISABLED_VALUE,
  VM_OUTPUT_DIR,
} from "./types"

export function buildRunEnv(opts: RunOptions, imdsEndpoint: string): Record<string, string> {
  return {
    [ENV_ENDPOINT]: imdsEndpoint,
    [ENV_ENDPOINT_MODE]: ENV_ENDPOINT_MODE_VALUE,
    [ENV_V1_DISABLED]: ENV_V1_DISABLED_VALUE,
    [ENV_REGION]: opts.region ?? DEFAULT_REGION,
    [ENV_SANDY_OUTPUT]: VM_OUTPUT_DIR,
  }
}
