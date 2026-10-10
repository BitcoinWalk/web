import {request as httpRequest} from "node:http";

export type JsonTransport=(input:string,init?:RequestInit)=>Promise<Response>;
const virtualHost=/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/;

/** GET-only, loopback-only virtual-host transport. It never forwards provider
 * credentials and bounds every response before returning it to a caller. */
export function loopbackVirtualHostRequest(input:string,init:RequestInit={}):Promise<Response>{
  const url=new URL(input),headers=new Headers(init.headers),host=headers.get("host")??"";
  if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||!virtualHost.test(host)||init.method!=="GET")return Promise.reject(new Error("invalid private provider request"));
  return new Promise((resolve,reject)=>{
    let settled=false,bytes=0;const chunks:Buffer[]=[];
    const finish=(error?:Error,response?:Response)=>{if(settled)return;settled=true;init.signal?.removeEventListener("abort",abort);error?reject(error):resolve(response!);};
    const call=httpRequest({hostname:"127.0.0.1",port:Number(url.port),path:url.pathname+url.search,method:"GET",headers:{Accept:"application/json",Host:host}},response=>{
      response.on("data",chunk=>{const value=Buffer.from(chunk);bytes+=value.length;if(bytes>65_536)call.destroy(new Error("provider response too large"));else chunks.push(value);});
      response.on("end",()=>finish(undefined,new Response(Buffer.concat(chunks),{status:response.statusCode??502,headers:{
        "Content-Type":String(response.headers["content-type"]??""),
        ...(response.headers["access-control-allow-origin"]==="*"?{"Access-Control-Allow-Origin":"*"}:{}),
      }})));
      response.on("error",error=>finish(error));
    });
    const abort=()=>call.destroy(new Error("provider request aborted"));
    call.on("error",error=>finish(error));call.setTimeout(5000,()=>call.destroy(new Error("provider request timed out")));
    if(init.signal?.aborted)abort();else init.signal?.addEventListener("abort",abort,{once:true});call.end();
  });
}

/** Staging-only verification bridge: retain the canonical public URL in the
 * signed evidence while resolving its path against the isolated provider. */
export function canonicalLoopbackTransport(origin:string,domain:string):typeof fetch{
  const privateOrigin=new URL(origin),canonical=`https://${domain}`;
  if(privateOrigin.protocol!=="http:"||privateOrigin.hostname!=="127.0.0.1"||!privateOrigin.port||privateOrigin.pathname!=="/"||privateOrigin.search||privateOrigin.hash||!virtualHost.test(domain))throw new Error("invalid private provider origin");
  return (async(input:RequestInfo|URL,init:RequestInit={})=>{
    const target=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    if(target.origin!==canonical||target.username||target.password||target.hash)throw new Error("invalid canonical provider request");
    return loopbackVirtualHostRequest(privateOrigin.origin+target.pathname+target.search,{...init,method:"GET",headers:{Accept:"application/json",Host:domain}});
  }) as typeof fetch;
}

/** Authenticated companion-API transport for the same isolated virtual host.
 * It accepts only the BitcoinWalk API namespace and bounded JSON bodies. */
export function loopbackApiTransport(origin:string,domain:string):typeof fetch{
  const privateOrigin=new URL(origin);
  if(privateOrigin.protocol!=="http:"||privateOrigin.hostname!=="127.0.0.1"||!privateOrigin.port||privateOrigin.pathname!=="/"||privateOrigin.search||privateOrigin.hash||!virtualHost.test(domain))throw new Error("invalid private provider origin");
  return (async(input:RequestInfo|URL,init:RequestInit={})=>{
    const target=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url),method=init.method??"GET",source=new Headers(init.headers);
    const authorization=source.get("authorization")??"",body=typeof init.body==="string"?init.body:"";
    if(target.origin!==privateOrigin.origin||target.username||target.password||target.hash||!target.pathname.startsWith("/v1/bitcoinwalk/")||
      !["GET","POST"].includes(method)||!/^(?:Bearer )?[A-Za-z0-9_-]{43,256}$/.test(authorization)||body.length>16_384||method==="POST"&&!body)
      throw new Error("invalid private provider API request");
    return new Promise<Response>((resolve,reject)=>{
      let settled=false,bytes=0;const chunks:Buffer[]=[];
      const finish=(error?:Error,response?:Response)=>{if(settled)return;settled=true;init.signal?.removeEventListener("abort",abort);error?reject(error):resolve(response!);};
      const call=httpRequest({hostname:"127.0.0.1",port:Number(privateOrigin.port),path:target.pathname+target.search,method,
        headers:{Accept:"application/json",Authorization:authorization,Host:domain,...(method==="POST"?{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)}:{})}},response=>{
        response.on("data",chunk=>{const value=Buffer.from(chunk);bytes+=value.length;if(bytes>16_384)call.destroy(new Error("provider API response too large"));else chunks.push(value);});
        response.on("end",()=>finish(undefined,new Response(Buffer.concat(chunks),{status:response.statusCode??502,headers:{"Content-Type":String(response.headers["content-type"]??"")}})));
        response.on("error",error=>finish(error));
      });
      const abort=()=>call.destroy(new Error("provider API request aborted"));
      call.on("error",error=>finish(error));call.setTimeout(5000,()=>call.destroy(new Error("provider API request timed out")));
      if(init.signal?.aborted)abort();else init.signal?.addEventListener("abort",abort,{once:true});if(body)call.write(body);call.end();
    });
  }) as typeof fetch;
}
