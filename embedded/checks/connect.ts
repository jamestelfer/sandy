import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2"
import { progress } from "../sandy.js"
progress("Using ECS SDK to check connectivity to IMDS...")
const client = new EC2Client({})
const result = await client.send(new DescribeRegionsCommand({}))
progress(`Connect succeeded, found (${result.Regions?.length ?? 0} regions)`)
console.log("sandy: connect OK")
