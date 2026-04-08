import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { Table } from "console-table-printer";

const region = process.env.AWS_REGION ?? "us-west-2";

const sts = new STSClient({ region, ...(process.env.SANDY_CONNECT_DEBUG ? { logger: console } : {}) });
const identity = await sts.send(new GetCallerIdentityCommand({}));

const table = new Table({
  title: "AWS Identity",
  columns: [
    { name: "field", alignment: "left" },
    { name: "value", alignment: "left" },
  ],
});

table.addRow({ field: "Account", value: identity.Account ?? "unknown" });
table.addRow({ field: "ARN", value: identity.Arn ?? "unknown" });
table.addRow({ field: "Region", value: region });

table.printTable();

// Verify non-AWS traffic is blocked
let networkBlocked = false;
try {
  await fetch("https://example.com");
  console.error("FAIL: expected network request to example.com to be blocked");
  process.exit(1);
} catch {
  networkBlocked = true;
}
console.log(`Network isolation: ${networkBlocked ? "PASS" : "FAIL"} (example.com blocked)`);
