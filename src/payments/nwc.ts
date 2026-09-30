import {finalizeEvent,getPublicKey,nip04,nip44,nip47,verifyEvent,type Event} from "nostr-tools";
import {Relay} from "nostr-tools/relay";
import {decode} from "bolt11";
import {PRICE_MSAT,type Invoice,type PaymentWallet} from "./service";
const {parseConnectionString}=nip47;
function parsePrivateConnection(value:string):ReturnType<typeof parseConnectionString>{
 try{return parseConnectionString(value);}catch{throw new Error("Invalid NWC configuration");}
}

export function validateInvoice(result:Record<string,unknown>,now=Math.floor(Date.now()/1000)):Invoice {
 if(result.type!=="incoming"||result.amount!==PRICE_MSAT||typeof result.invoice!=="string"||!result.invoice.startsWith("lnbc"))throw new Error("Invalid invoice response");
 const decoded=decode(result.invoice),hash=decoded.tagsObject.payment_hash;
 if(decoded.millisatoshis!==String(PRICE_MSAT)||!hash||hash!==result.payment_hash||!decoded.timestamp||decoded.timestamp>now+60||!decoded.timeExpireDate||decoded.timeExpireDate<=now||decoded.timeExpireDate>now+86400)throw new Error("Invoice amount, hash, network or expiry mismatch");
 return{invoice:result.invoice,paymentHash:hash,amountMsat:PRICE_MSAT,createdAt:decoded.timestamp,expiresAt:decoded.timeExpireDate};
}
/** Deliberately exposes only the two receiving methods; never a generic wallet RPC. */
export class NwcWallet implements PaymentWallet {
 private connection:ReturnType<typeof parseConnectionString>;
 private secret:Uint8Array;
 constructor(connectionString:string){
  this.connection=parsePrivateConnection(connectionString);
  if(!/^[0-9a-f]{64}$/.test(this.connection.secret)||!/^[0-9a-f]{64}$/.test(this.connection.pubkey)||!this.connection.relays.length)throw new Error("Invalid NWC configuration");
  for(const address of this.connection.relays){let url:URL;try{url=new URL(address);}catch{throw new Error("Invalid NWC relay configuration");}if(url.protocol!=="wss:"||url.username||url.password)throw new Error("NWC relay requires WSS");}
  this.secret=Buffer.from(this.connection.secret,"hex");
 }
 async makeInvoice(description:string):Promise<Invoice>{return validateInvoice(await this.call("make_invoice",{amount:PRICE_MSAT,description,expiry:3600}));}
 lookupInvoice(hash:string):Promise<Record<string,unknown>>{if(!/^[0-9a-f]{64}$/.test(hash))throw new Error("Invalid payment hash");return this.call("lookup_invoice",{payment_hash:hash});}
 private async call(method:"make_invoice"|"lookup_invoice",params:Record<string,unknown>):Promise<Record<string,unknown>>{
  // Fail over connections before publication only. A timeout after publication
  // is ambiguous and must never automatically create another invoice.
  let relay:Relay|undefined;
  for(const address of this.connection.relays){const candidate=new Relay(address,{enableReconnect:false});candidate.onauth=async template=>finalizeEvent(template,this.secret);try{await candidate.connect({timeout:5000});relay=candidate;break;}catch{candidate.close();}}
  if(!relay)throw new Error("Wallet temporarily unavailable");
  try{
   const active=relay;
   const info=await new Promise<Event>((resolve,reject)=>{
    let latest:Event|undefined;
    const timer=setTimeout(()=>{sub.close();reject(new Error("Wallet information unavailable"));},5000);
    const sub=active.subscribe([{kinds:[13194],authors:[this.connection.pubkey],limit:1}],{
     onevent:event=>{if(verifyEvent(event)&&event.pubkey===this.connection.pubkey)latest=event;},
     oneose:()=>{clearTimeout(timer);sub.close();if(latest)resolve(latest);else reject(new Error("Wallet information unavailable"));},
    });
   });
   if(!info.content.split(" ").includes(method))throw new Error("Wallet method unavailable");
   const encryption=info.tags.find(t=>t[0]==="encryption")?.[1]?.split(" ")??["nip04"];
   const modern=encryption.includes("nip44_v2");
   if(!modern&&!encryption.includes("nip04"))throw new Error("Wallet encryption unavailable");
   const key=nip44.getConversationKey(this.secret,this.connection.pubkey),plaintext=JSON.stringify({method,params});
   const content=modern?nip44.encrypt(plaintext,key):await nip04.encrypt(this.secret,this.connection.pubkey,plaintext);
   const now=Math.floor(Date.now()/1000);
   const request=finalizeEvent({kind:23194,created_at:now,tags:[["p",this.connection.pubkey],["encryption",modern?"nip44_v2":"nip04"],["expiration",String(now+60)]],content},this.secret);
   return await new Promise<Record<string,unknown>>((resolve,reject)=>{
    let finished=false;
    const finish=(result?:Record<string,unknown>)=>{if(finished)return;finished=true;clearTimeout(timer);sub.close();if(result)resolve(result);else reject(new Error("Wallet request could not be confirmed"));};
    const timer=setTimeout(()=>finish(),20000);
    const sub=active.subscribe([{kinds:[23195],authors:[this.connection.pubkey],"#e":[request.id]}],{
     onevent:async event=>{
      try{
       if(event.content.length>32768||!verifyEvent(event)||event.pubkey!==this.connection.pubkey||!event.tags.some(t=>t[0]==="e"&&t[1]===request.id)||!event.tags.some(t=>t[0]==="p"&&t[1]===getPublicKey(this.secret)))return;
       const response=JSON.parse(modern?nip44.decrypt(event.content,key):await nip04.decrypt(this.secret,this.connection.pubkey,event.content));
       if(response.result_type!==method||response.error||!response.result||typeof response.result!=="object"){finish();return;}
       finish(response.result);
      }catch{finish();}
     },
    });
    active.publish(request).catch(()=>finish());
   });
  }catch{throw new Error("Wallet request could not be confirmed");}finally{relay.close();}
 }
}

