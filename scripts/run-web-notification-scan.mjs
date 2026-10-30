import {fileURLToPath} from "node:url";

const loopback=new Set(["127.0.0.1","localhost","[::1]"]);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;

export async function runScheduledNotificationScan(env=process.env,fetcher=fetch){
 const token=env.BITCOINWALK_NOTIFICATION_RUN_TOKEN?.trim()??"",method=env.BITCOINWALK_NOTIFICATION_RUN_METHOD??"GET",url=new URL(env.BITCOINWALK_NOTIFICATION_RUN_URL??"http://127.0.0.1:3000/api/internal/notifications/run");
 if(token.length<32)throw new Error("Notification runner credential is unavailable.");
 if(!["GET","POST"].includes(method)||url.protocol!=="http:"||!loopback.has(url.hostname)||url.pathname!=="/api/internal/notifications/run")throw new Error("Notification runner configuration is unsafe.");
 const response=await fetcher(url,{method,headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60_000)});
 if(!response.ok)throw new Error(`Notification runner returned HTTP ${response.status}.`);
 const body=await response.json();
 if(!body||count(body.checkedAt)===null)throw new Error("Notification runner returned an invalid result.");
 if(method==="GET"){
  if(body.readOnly!==true||!Array.isArray(body.candidates))throw new Error("Notification preview returned an invalid result.");
  return {checkedAt:body.checkedAt,mode:"preview",candidates:body.candidates.length};
 }
 const result={checkedAt:body.checkedAt,mode:"send",candidates:count(body.candidates),created:count(body.created),sent:count(body.sent),deferred:count(body.deferred),failed:count(body.failed)};
 if(Object.values(result).some(value=>value===null))throw new Error("Notification sender returned an invalid result.");
 if(result.failed)throw new Error(`Notification sender recorded ${result.failed} failed delivery attempt(s).`);
 return result;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])runScheduledNotificationScan().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error instanceof Error?error.message:"Notification runner failed.");process.exitCode=1;});
