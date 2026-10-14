import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
  type Service,
} from "@aws-sdk/client-ecs"
import { Table } from "console-table-printer"
import { chunks, progress } from "../sandy.js"

const args = process.argv.slice(2)
if (args.length < 1) {
  console.error("Usage: ecs_services.ts <cluster-name>")
  process.exit(1)
}

const clusterName = args[0]
const region = process.env.AWS_REGION ?? "us-west-2"
const ecs = new ECSClient({ region })

// Generator: yields individual service ARNs, one page at a time
async function* listServiceArns(cluster: string): AsyncGenerator<string> {
  let nextToken: string | undefined
  do {
    const resp = await ecs.send(new ListServicesCommand({ cluster, nextToken }))
    const arns = resp.serviceArns ?? []
    progress(`listed ${arns.length} services`)
    for (const arn of arns) {
      yield arn
    }
    nextToken = resp.nextToken
  } while (nextToken)
}

// Generator: DescribeServices accepts at most 10 services per call, so group
// the ARN stream into chunks of 10 here, and yield individual services
async function* describeServices(cluster: string): AsyncGenerator<Service> {
  for await (const arns of chunks(listServiceArns(cluster), 10)) {
    const resp = await ecs.send(new DescribeServicesCommand({ cluster, services: arns }))
    for (const service of resp.services ?? []) {
      yield service
    }
  }
}

// Consume the stream, building the table as results arrive
const table = new Table({
  title: `ECS Services (${clusterName})`,
  columns: [
    { name: "Service", alignment: "left" },
    { name: "Running", alignment: "right" },
    { name: "Desired", alignment: "right" },
    { name: "Status", alignment: "left" },
    { name: "Deployment", alignment: "left" },
  ],
})

let count = 0
for await (const service of describeServices(clusterName)) {
  const primaryDeployment = service.deployments?.find((d) => d.status === "PRIMARY")

  table.addRow({
    Service: service.serviceName ?? "unknown",
    Running: service.runningCount ?? 0,
    Desired: service.desiredCount ?? 0,
    Status: service.status ?? "unknown",
    Deployment: primaryDeployment?.rolloutState ?? "unknown",
  })
  count++
}

if (count === 0) {
  console.log(`No services found in cluster ${clusterName}`)
} else {
  table.printTable()
}
