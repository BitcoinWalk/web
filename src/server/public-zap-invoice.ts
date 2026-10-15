import {nip57,verifyEvent,type Event} from "nostr-tools";
import {relayConfig} from "../lib/relay-config";
import {lightningAddress,parseZapPayMetadata} from "../nostr/public-zap";
import {canonicalLoopbackTransport} from "../rustress/loopback-http";

const hex=/^[0-9a-f]{64}$/;
const maximumBodyBytes=65_536;
export type PublicZapInvoiceInput={address:string;amountMsat:number;zapRequest:string};

export class PublicZapInvoiceError extends Error{constructor(message:string,readonly status=400){super(message);}}

export function publicZapInvoiceTransport(port=process.env.PORT):typeof fetch{
 const value=Number(port);
 return typeof port==="string"&&/^\d{1,5}$/.test(port)&&Number.isSafeInteger(value)&&value>0&&value<=65_535
  ?canonicalLoopbackTransport(`http://127.0.0.1:${value}`,"bitcoinwalk.org"):fetch;
}

async function json(response:Response){
 if(!response.ok)throw new PublicZapInvoiceError("The city Lightning address could not be loaded.",502);
 const reader=response.body?.getReader();if(!reader)throw new PublicZapInvoiceError("The payment service returned an empty response.",502);
 const decoder=new TextDecoder();let text="",size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maximumBodyBytes)throw new PublicZapInvoiceError("The payment service returned an invalid response.",502);text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text) as unknown;}
 catch(error){if(error instanceof PublicZapInvoiceError)throw error;throw new PublicZapInvoiceError("The payment service returned an invalid response.",502);}finally{await reader.cancel();}
}
function one(tags:string[][],name:string){const rows=tags.filter(tag=>tag[0]===name);return rows.length===1&&rows[0].length===2?rows[0][1]:null;}
function event(value:unknown):Event{
 if(!value||typeof value!=="object")throw new PublicZapInvoiceError("The signed zap request is invalid.");
 const row=value as Event;if(row.kind!==9734||!verifyEvent(structuredClone(row))||nip57.validateZapRequest(JSON.stringify(row))!==null)throw new PublicZapInvoiceError("The signed zap request is invalid.");return row;
}

export async function createPublicZapInvoice(input:PublicZapInvoiceInput,fetcher:typeof fetch=fetch){
 if(!Number.isSafeInteger(input.amountMsat)||input.amountMsat<1||input.amountMsat>1_000_000_000||typeof input.zapRequest!=="string"||input.zapRequest.length>32_768)throw new PublicZapInvoiceError("The zap request is invalid.");
 const address=lightningAddress(`lightning:${input.address}`),localPart=address.address.split("@")[0];
 let request:Event;try{request=event(JSON.parse(input.zapRequest));}catch(error){if(error instanceof PublicZapInvoiceError)throw error;throw new PublicZapInvoiceError("The signed zap request is invalid.");}
 const amount=one(request.tags,"amount"),recipient=one(request.tags,"p"),relays=request.tags.filter(tag=>tag[0]==="relays");
 if(amount!==String(input.amountMsat)||!recipient||!hex.test(recipient)||relays.length!==1||relays[0].length<2||relays[0].slice(1).some(relay=>!relayConfig.zapReceiptRelays.includes(relay)))throw new PublicZapInvoiceError("The signed zap request does not match this payment.");
 let metadataResponse:Response;try{metadataResponse=await fetcher(address.metadata,{headers:{accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10_000)});}catch{throw new PublicZapInvoiceError("The city Lightning address could not be reached.",502);}
 const metadata=parseZapPayMetadata(await json(metadataResponse));
 if(input.amountMsat<metadata.minSendable||input.amountMsat>metadata.maxSendable)throw new PublicZapInvoiceError(`This address accepts ${Math.ceil(metadata.minSendable/1000).toLocaleString()}–${Math.floor(metadata.maxSendable/1000).toLocaleString()} sats.`);
 const callback=new URL(metadata.callback);
 if(callback.pathname!==`/lnurlp/${localPart}/callback`||callback.search||callback.hash)throw new PublicZapInvoiceError("The city Lightning callback is invalid.",502);
 callback.searchParams.set("amount",String(input.amountMsat));callback.searchParams.set("nostr",input.zapRequest);
 let invoiceResponse:Response;try{invoiceResponse=await fetcher(callback,{headers:{accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15_000)});}catch{throw new PublicZapInvoiceError("The zap invoice service could not be reached.",502);}
 const body=await json(invoiceResponse) as {pr?:unknown;status?:unknown;reason?:unknown};
 if(body.status==="ERROR"||typeof body.pr!=="string")throw new PublicZapInvoiceError(typeof body.reason==="string"?body.reason:"The zap invoice could not be created.",502);
 return {invoice:body.pr,provider:metadata.nostrPubkey};
}
