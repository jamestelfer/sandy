import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
  type Service,
} from "@aws-sdk/client-ecs"
import { Table } from "console-table-printer"
import { progress } from "sandy"

const args = process.argv.slice(2)
if (args.length < 1) {
  console.error("Usage: ecs_services.ts <cluster-name>")
  process.exit(1)
}

const clusterName = args[0]
const region = process.env.AWS_REGION ?? "us-west-2"
const ecs = new ECSClient({ region })

// Generator: yields batches of service ARNs, one page at a time
async function* listServiceArns(cluster: string): AsyncGenerator<string[]> {
  let nextToken: string | undefined
  do {
    const resp = await ecs.send(new ListServicesCommand({ cluster, nextToken }))
    const arns = resp.serviceArns ?? []
    if (arns.length > 0) {
      progress(`listed ${arns.length} services`)
      yield arns
    }
    nextToken = resp.nextToken
  } while (nextToken)
}

// Generator: takes ARN batches, describes each batch, yields individual services
async function* describeServices(cluster: string): AsyncGenerator<Service> {
  for await (const arnBatch of listServiceArns(cluster)) {
    const resp = await ecs.send(new DescribeServicesCommand({ cluster, services: arnBatch }))
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
