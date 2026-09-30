/** Bound unauthenticated request bytes before JSON parsing or signature work. */
export async function paymentBody(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw new Error("Missing request body");
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>32768){await reader.cancel();throw new Error("Request too large");}chunks.push(value);}}
 finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

