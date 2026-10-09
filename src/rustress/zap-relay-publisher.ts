import {BlockList,isIP} from "node:net";
import {verifyEvent,type Event} from "nostr-tools";
import {z} from "zod";

const relay=z.string().url().transform(value=>{
 const url=new URL(value),hostname=url.hostname.replace(/^\[|\]$/g,"");if(url.protocol!=="wss:"||url.username||url.password||url.hash||url.port&&!/^\d+$/.test(url.port)||isIP(hostname)||hostname.toLowerCase()==="localhost")throw new Error();return url.toString();
});
type Address={address:string;family:4|6};
export type PinnedRelayTransport={send:(input:{url:string;addresses:Address[];event:Event;timeoutMs:number})=>Promise<boolean>};

const blocked4=new BlockList(),blocked6=new BlockList();
for(const [network,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const)blocked4.addSubnet(network,prefix,"ipv4");
for(const [network,prefix] of [["::",128],["::1",128],["::ffff:0:0",96],["64:ff9b:1::",48],["100::",64],["2001:db8::",32],["2001:10::",28],["fc00::",7],["fe80::",10],["ff00::",8]] as const)blocked6.addSubnet(network,prefix,"ipv6");

function publicAddresses(input:Address[]){
 if(input.length<1||input.length>8)throw new Error("Relay DNS rejected");const seen=new Set<string>();
 return input.map(row=>{const family=isIP(row.address);if(family!==row.family||(family===4?blocked4.check(row.address,"ipv4"):blocked6.check(row.address,"ipv6"))||seen.has(row.address))throw new Error("Relay DNS rejected");seen.add(row.address);return row;});
}
async function bounded<T>(operation:Promise<T>,timeoutMs:number){
 let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Relay timeout")),timeoutMs);timer.unref?.();})]);}finally{if(timer)clearTimeout(timer);}
}

/** Receipt relay policy. User-supplied relay URLs must match an operator
 * allowlist. DNS is rechecked immediately before every send, and the injected
 * transport must connect only to one of the returned addresses while retaining
 * the URL hostname for TLS/SNI verification. */
export class HardenedZapRelayPublisher{
 readonly #allowed:Set<string>;
 constructor(allowed:string[],private resolve:(hostname:string)=>Promise<Address[]>,private transport:PinnedRelayTransport,private timeoutMs=5000){
  const parsed=z.array(relay).min(1).max(64).parse(allowed);if(new Set(parsed).size!==parsed.length||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>15000)throw new Error("Invalid relay policy");this.#allowed=new Set(parsed);
 }
 async publish(requested:string[],event:Event){
  if(event.kind!==9735||!verifyEvent(JSON.parse(JSON.stringify(event))))throw new Error("Invalid receipt event");const parsed=z.array(relay).min(1).max(3).parse(requested),unique=[...new Set(parsed)];if(unique.length!==parsed.length)throw new Error("Invalid relay request");
  const approved=unique.filter(value=>this.#allowed.has(value));if(!approved.length)throw new Error("No approved receipt relay");
  const attempts=await Promise.all(approved.map(async url=>{try{const target=new URL(url),addresses=publicAddresses(await bounded(this.resolve(target.hostname),this.timeoutMs));return await bounded(this.transport.send({url,addresses,event,timeoutMs:this.timeoutMs}),this.timeoutMs)?url:null;}catch{return null;}}));
  return attempts.filter((value):value is string=>value!==null);
 }
}
