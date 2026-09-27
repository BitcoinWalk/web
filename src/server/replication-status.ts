import {z} from "zod";
import {readFile,stat} from "node:fs/promises";
import {dirname,resolve} from "node:path";

const state=z.enum(["healthy","pending","degraded"]);
const reportSchema=z.object({
 version:z.literal(1),
 state,
 reconciled:z.boolean(),
 cities:z.array(z.object({cityId:z.string().uuid(),destination:z.url().refine(value=>value.startsWith("wss://")),state,counts:z.record(z.string(),z.number().int().nonnegative())}).strict()),
}).strict();
export type ReplicationStatus=z.infer<typeof reportSchema>;

async function loadStatusToken():Promise<string>{
 const path=process.env.REPLICATION_STATUS_TOKEN_FILE;
 if(!path)throw new Error("Replication status is not configured.");
 const metadata=await stat(path);
 if(!metadata.isFile())throw new Error("Replication status credential is not a regular file.");
 const credentialDirectory=process.env.CREDENTIALS_DIRECTORY;
 const systemdManaged=Boolean(credentialDirectory&&resolve(dirname(path))===resolve(credentialDirectory));
 if(!systemdManaged&&(metadata.mode&0o077)!==0)throw new Error("Replication status credential permissions must be owner-only.");
 const value=await readFile(path,"utf8");
 if(!/^[0-9a-f]{64}\n?$/.test(value))throw new Error("Replication status credential is malformed.");
 return value.slice(0,64);
}

export async function loadReplicationStatus():Promise<ReplicationStatus>{
 const token=await loadStatusToken();
 const response=await fetch("http://127.0.0.1:3334/replication/status",{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error(`Replication status returned HTTP ${response.status}.`);
 return reportSchema.parse(await response.json());
}
