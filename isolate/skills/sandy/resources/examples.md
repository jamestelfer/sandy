# Sandy Examples

## EC2: Describe instances by tag

Finds EC2 instances matching a tag, extracts key fields with JMESPath, and prints a table. Uses an async generator to handle pagination across multiple reservation pages.

```bash
sandy run --profile myaccount-ReadOnly --script examples/ec2_describe.ts -- Name my-instance
```

```typescript
import {
  EC2Client,
  DescribeInstancesCommand,
  type Instance,
} from "@aws-sdk/client-ec2";
import { search } from "jmespath";
import { Table } from "console-table-printer";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: ec2_describe.ts <tag-name> <tag-value>");
  process.exit(1);
}

const [tagName, tagValue] = args;
const region = process.env.AWS_REGION ?? "us-west-2";
const ec2 = new EC2Client({ region });

// Generator: yields instances one page at a time
async function* findInstances(
  tag: string,
  value: string
): AsyncGenerator<Instance> {
  let nextToken: string | undefined;
  do {
    const resp = await ec2.send(
      new DescribeInstancesCommand({
        Filters: [{ Name: `tag:${tag}`, Values: [value] }],
        NextToken: nextToken,
      })
    );
    for (const reservation of resp.Reservations ?? []) {
      for (const instance of reservation.Instances ?? []) {
        yield instance;
      }
    }
    nextToken = resp.NextToken;
    console.log(`  fetched page (token: ${nextToken ? "more" : "done"})...`);
  } while (nextToken);
}

interface InstanceInfo {
  InstanceId: string;
  InstanceType: string;
  State: string;
  PrivateIp: string;
  LaunchTime: string;
}

const table = new Table({
  title: `EC2 Instances (${tagName}=${tagValue})`,
  columns: [
    { name: "InstanceId", alignment: "left" },
    { name: "InstanceType", alignment: "left" },
    { name: "State", alignment: "left" },
    { name: "PrivateIp", alignment: "left" },
    { name: "LaunchTime", alignment: "left" },
  ],
});

let count = 0;
for await (const instance of findInstances(tagName, tagValue)) {
  // JMESPath to extract fields from a single instance
  const info: InstanceInfo = search(instance, `{
    InstanceId: InstanceId,
    InstanceType: InstanceType,
    State: State.Name,
    PrivateIp: PrivateIpAddress,
    LaunchTime: LaunchTime
  }`);
  table.addRow(info);
  count++;
}

if (count === 0) {
  console.log(`No instances found with tag ${tagName}=${tagValue}`);
} else {
  table.printTable();
}
```
