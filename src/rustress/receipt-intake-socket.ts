import {timingSafeEqual} from "node:crypto";
import type {RequestListener} from "node:http";
import {validateZapRequest,type ZapReceiptAuthority} from "./zap-receipt-authority";

/** Same private handler in production and the cross-language rehearsal. No
 * request can choose a socket, provider key, signer or wallet capability. */
export function receiptIntakeHandler(provider:string,token:string,authority:ZapReceiptAuthority,health:()=>unknown):RequestListener {
 if(!/^[0-9a-f]{64}$/.test(provider)||!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw new Error("Invalid receipt intake configuration");
 return (request,response)=>{void(async()=>{
  let status=404,result:unknown={error:"not-found"};
  try{
   if(request.method==="GET"&&request.url==="/health"){status=200;result=health();}
   else if(request.method==="POST"&&["/v1/receipts","/v1/requests/validate"].includes(request.url??"")){
    const supplied=Buffer.from(request.headers.authorization?.startsWith("Bearer ")?request.headers.authorization.slice(7):""),expected=Buffer.from(token);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){status=401;result={error:"unauthorized"};}
    else if(!request.headers["content-type"]?.toLowerCase().startsWith("application/json")){status=415;result={error:"unsupported-media-type"};}
    else{
     const chunks:Buffer[]=[];let size=0;for await(const chunk of request){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>98304)throw new Error();chunks.push(bytes);}
     const input:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
     if(request.url==="/v1/requests/validate"){status=200;result=validateZapRequest(input,provider);}
     else{status=202;result=authority.enqueue(input);}
    }
   }
  }catch{status=400;result={error:"request-rejected"};}
  const document=JSON.stringify(result);response.writeHead(status,{"content-type":"application/json","content-length":Buffer.byteLength(document),"cache-control":"no-store","x-content-type-options":"nosniff"});response.end(document);
 })();};
}
