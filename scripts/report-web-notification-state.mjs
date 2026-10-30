import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";

if(process.argv.length!==3)throw new Error("Usage: report-web-notification-state.mjs DATABASE");
const tables=[
  ["web_push_subscription","id"],
  ["web_push_subscription_audit","id"],
  ["web_notification","id"],
  ["web_notification_delivery","noticeId,deviceId"],
];
const db=new DatabaseSync(process.argv[2],{readOnly:true});
try{
  const integrity=Object.values(db.prepare("PRAGMA integrity_check").get()??{})[0];
  if(integrity!=="ok")throw new Error("SQLite integrity check failed");
  const report={version:1,integrity,tables:Object.fromEntries(tables.map(([name,order])=>{
    const rows=db.prepare(`SELECT * FROM ${name} ORDER BY ${order}`).all();
    return [name,{rows:rows.length,sha256:createHash("sha256").update(JSON.stringify(rows)).digest("hex")}];
  }))};
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}finally{db.close();}
