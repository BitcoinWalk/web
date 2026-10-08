import {createServer} from "node:http";
import {createHash,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {RemoteJournalStore,journalClaimSchema} from "./remote-journal-store";

/** Private loopback service for a separately authorized SSH tunnel. No listener
 * starts on import, no public proxy route, no credentials from browser input. */
export function createRemoteJournalServer(store:RemoteJournalStore,credentials:{clientToken:string;operatorToken:string}){
 for(const token of Object.values(credentials))if(!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error("Invalid journal credentials");
 if(credentials.clientToken===credentials.operatorToken)throw new Error("Separate operator credential required");
 const digest=(s:string)=>createHash("sha256").update(s).digest();
 const client=digest(`Bearer ${credentials.clientToken}`),operator=digest(`Bearer ${credentials.operatorToken}`);
 const server=createServer(async(req,res)=>{
  const reply=(status:number,value:unknown)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value));};
  try{
   if(!["127.0.0.1","::ffff:127.0.0.1","::1"].includes(req.socket.remoteAddress??"")){reply(403,{error:"denied"});return;}
   const auth=digest(req.headers.authorization??""),admin=req.url==="/v1/journal/control";
   if(!timingSafeEqual(auth,admin?operator:client)){reply(403,{error:"denied"});return;}
   if(req.method==="GET"&&req.url==="/v1/journal/status"){reply(200,store.state());return;}
   if(req.method!=="POST"||!["/v1/journal/claim","/v1/journal/page","/v1/journal/control"].includes(req.url??"")){reply(404,{error:"not-found"});return;}
   if(req.headers["content-type"]!=="application/json"||req.headers["content-encoding"]){reply(400,{error:"invalid"});return;}
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of req){size+=chunk.length;if(size>8192){reply(413,{error:"too-large"});return;}chunks.push(Buffer.from(chunk));}
   const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
   if(req.url==="/v1/journal/claim"){reply(200,store.claim(journalClaimSchema.parse(body)));return;}
   if(req.url==="/v1/journal/page"){const p=z.object({after:z.number().int().safe().nonnegative()}).strict().parse(body);reply(200,store.page(p.after));return;}
   const p=z.object({serviceId:z.uuid(),expectedFence:z.uuid().nullable(),action:z.enum(["activate","pause"])}).strict().parse(body);
   reply(200,store.control(p.serviceId,p.expectedFence,p.action));
  }catch{if(!res.headersSent)reply(409,{error:"journal-request-rejected"});}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.timeout=5000;server.maxHeadersCount=20;
 return server;
}
