export const ENV_ENDPOINT = "AWS_EC2_METADATA_SERVICE_ENDPOINT"
export const ENV_ENDPOINT_MODE = "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE"
export const ENV_ENDPOINT_MODE_VALUE = "IPv4"
export const ENV_V1_DISABLED = "AWS_EC2_METADATA_V1_DISABLED"
export const ENV_V1_DISABLED_VALUE = "true"
export const ENV_REGION = "AWS_REGION"
export const ENV_SANDY_OUTPUT = "SANDY_OUTPUT"
export const VM_BOOTSTRAP = "/tmp/bootstrap"
export const VM_SCRIPTS_DIR = "/workspace/scripts"
export const VM_OUTPUT_DIR = "/workspace/output"
export const DEFAULT_REGION = "us-west-2"

export type ProgressCallback = (message: string) => void

export interface RunOptions {
  scriptPath: string
  imdsPort: number
  region?: string
  session: string
  sessionDir: string
  scriptArgs?: string[]
}

export interface RunResult {
  exitCode: number
  output: string
  outputFiles: string[]
}
