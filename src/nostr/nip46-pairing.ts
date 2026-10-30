import {SimplePool,type Filter} from "nostr-tools";
import type {BunkerSigner} from "nostr-tools/nip46";

export const NIP46_PAIRING_RELAYS=["wss://remote.bitcoinwalk.org/"];
export const NIP46_PAIRING_TIMEOUT_MS=90_000;

/** The dedicated BitcoinWalk signer relay keeps only a short in-memory handoff
 * window. Removing nostr-tools' live-only sentinel lets a newly ready browser
 * listener recover Amber's encrypted reply without making it durable. */
export function replayableNip46Filter(filter:Filter):Filter{
 if(filter.limit!==0)return filter;
 const replayable={...filter};
 delete replayable.limit;
 return replayable;
}

export class Nip46PairingPool extends SimplePool{
 override subscribe(...[relays,filter,params]:Parameters<SimplePool["subscribe"]>):ReturnType<SimplePool["subscribe"]>{
  return super.subscribe(relays,replayableNip46Filter(filter),params);
 }
}

const handoffClosed=(error:unknown)=>error instanceof Error&&error.message.includes("subscription closed before connection was established");
const aborted=()=>{const error=new Error("Remote signer connection cancelled.");error.name="AbortError";return error;};
function retryPause(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{
 const timer=setTimeout(done,ms);
 function done(){signal?.removeEventListener("abort",cancel);resolve();}
 function cancel(){clearTimeout(timer);signal?.removeEventListener("abort",cancel);reject(aborted());}
 signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();
});}

/** Mobile browsers commonly suspend the handoff WebSocket while the user opens
 * Amber. Retry only a subscription that closed before approval, using the same
 * in-memory URI and outer abort deadline so the relay's bounded memory replay
 * can deliver the one-time response when the browser resumes. */
export async function recoverNip46Handoff<T>(connect:()=>Promise<T>,{signal,retryDelayMs=750,onRetry}:{signal?:AbortSignal;retryDelayMs?:number;onRetry?:(attempt:number)=>void}={}):Promise<T>{
 let attempt=0;
 for(;;){
  if(signal?.aborted)throw aborted();
  try{return await connect();}catch(error){
   if(signal?.aborted)throw aborted();
   if(!handoffClosed(error))throw error;
   onRetry?.(++attempt);
   await retryPause(retryDelayMs,signal);
  }
 }
}

/** Amber can approve the connection before its listener is ready for the next
 * ephemeral request. Retry only get_public_key, never the one-time connection
 * secret or a signing request. */
export function readBunkerPublicKey(
 signer:Pick<BunkerSigner,"getPublicKey">,
 {signal,timeoutMs=NIP46_PAIRING_TIMEOUT_MS,retryDelays=[0,10_000,30_000]}:{signal?:AbortSignal;timeoutMs?:number;retryDelays?:number[]}={},
):Promise<string>{
 return new Promise((resolve,reject)=>{
  let settled=false,lastError:unknown;
  const timers:ReturnType<typeof setTimeout>[]=[];
  const finish=(action:()=>void)=>{if(settled)return;settled=true;timers.forEach(clearTimeout);signal?.removeEventListener("abort",abort);action();};
  const abort=()=>finish(()=>{const error=new Error("Remote signer connection cancelled.");error.name="AbortError";reject(error);});
  const read=()=>{if(settled)return;void signer.getPublicKey().then(pubkey=>finish(()=>resolve(pubkey))).catch(error=>{lastError=error;});};
  for(const delay of retryDelays)timers.push(setTimeout(read,delay));
  timers.push(setTimeout(()=>finish(()=>reject(lastError instanceof Error?lastError:new Error("Amber approved the connection, but BitcoinWalk did not receive the account response in time."))),timeoutMs));
  signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted)abort();
 });
}
