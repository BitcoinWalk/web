import {DatabaseSync} from "node:sqlite";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {createCityDirectoryRoot} from "../nostr/city-directory";
import {DirectorySuccessorRequestStore} from "./successor-request-store";

const cityId="ca2f9905-fb4d-4948-a12c-c792b28ec7c8";
function setup(){
 let now=2_000_000_000;
 const db=new DatabaseSync(":memory:"),store=new DirectorySuccessorRequestStore(db,()=>now),ownerKey=generateSecretKey(),ownerPubkey=getPublicKey(ownerKey),admin=getPublicKey(generateSecretKey()),recovery=getPublicKey(generateSecretKey());
 const root=finalizeEvent(createCityDirectoryRoot({cityId,ownerPubkey,operatorPubkeys:[admin],recoveryPubkey:recovery,primaryRelay:"wss://london.bitcoinwalk.org/",mirrorRelays:[]},now-100),ownerKey);
 const request=store.prepare({cityId,cityName:"London",cityRevisionId:"a".repeat(64),ownerPubkey,createdBy:admin,rootEventId:root.id,initialOwnerPubkey:ownerPubkey,predecessorEvent:root});
 return {store,request,ownerKey,ownerPubkey,admin,setNow:(value:number)=>now=value};
}

describe("durable city directory successor rehearsals",()=>{
 it("stores one exact owner-signed successor without publication and makes retries idempotent",()=>{const x=setup(),event=finalizeEvent(x.request.template,x.ownerKey);expect(x.store.sign(x.request.id,x.ownerPubkey,event).signedEvent?.id).toBe(event.id);expect(x.store.sign(x.request.id,x.ownerPubkey,event).classification).toBe("owner-update-successor-rehearsal");});
 it("rejects a wrong owner and a changed signed template",()=>{const x=setup(),event=finalizeEvent(x.request.template,x.ownerKey),changed=finalizeEvent({...x.request.template,content:`${x.request.template.content} `},x.ownerKey);expect(()=>x.store.sign(x.request.id,x.admin,event)).toThrow("current city owner");expect(()=>x.store.sign(x.request.id,x.ownerPubkey,changed)).toThrow("exact directory successor");});
 it("expires, rejects and explicitly supersedes while retaining evidence",()=>{const x=setup();expect(()=>x.store.transition(x.request.id,x.admin,"rejected",x.admin)).toThrow("not authorized");expect(x.store.transition(x.request.id,x.ownerPubkey,"rejected",x.admin).status).toBe("rejected");const next=x.store.prepare({cityId,cityName:"London",cityRevisionId:"b".repeat(64),ownerPubkey:x.ownerPubkey,createdBy:x.admin,rootEventId:x.request.rootEventId,initialOwnerPubkey:x.ownerPubkey,predecessorEvent:x.request.predecessorEvent,ttl:300});x.setNow(next.expiresAt);expect(x.store.get(next.id)?.status).toBe("expired");});
});
