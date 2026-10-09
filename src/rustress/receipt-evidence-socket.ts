import type {IncomingMessage,RequestListener} from "node:http";
import type {PayoutControlApi} from "./payout-control-api";

async function body(request:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of request){const value=Buffer.from(chunk);size+=value.length;if(size>16384)throw new Error();chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}

/** Owner-only receipt-evidence transport. It deliberately exposes exactly one
 * payout API route and therefore cannot issue invoices, change authority,
 * inspect operations or trigger a payment. */
export function receiptEvidenceSocketHandler(api:Pick<PayoutControlApi,"route">):RequestListener{
 return (request,response)=>{void (async()=>{let result:{status:number;body:Record<string,unknown>};try{
  if(request.method!=="POST"||request.url!=="/v1/receipts/evidence")result={status:404,body:{error:"not-found"}};
  else if(!request.headers["content-type"]?.toLowerCase().startsWith("application/json"))result={status:415,body:{error:"unsupported-media-type"}};
  else result=await api.route(request.method,request.url,request.headers.authorization,await body(request),"receipt-evidence");
 }catch{result={status:400,body:{error:"request-rejected"}};}response.writeHead(result.status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});response.end(JSON.stringify(result.body));})();};
}
