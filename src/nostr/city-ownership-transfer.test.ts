import {describe,expect,it} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey,type Event} from "nostr-tools";
import {createCityDirectoryRoot,createCityDirectoryRotation} from "./city-directory";
import {ownershipTransferAcceptanceTemplate,ownershipTransferAnchor,transferredCityAuthorization,type OwnershipTransferAcceptance} from "./city-ownership-transfer";
import {SUPER_ADMIN_PUBKEY} from "./authority";
import type {AuthorizationRecord} from "./city-records";

const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f",creatorKey=generateSecretKey(),nextKey=generateSecretKey(),recoveryKey=generateSecretKey(),creator=getPublicKey(creatorKey),next=getPublicKey(nextKey),recovery=getPublicKey(recoveryKey);
function fixture(){
 const root=finalizeEvent(createCityDirectoryRoot({cityId,ownerPubkey:creator,operatorPubkeys:[],recoveryPubkey:recovery,primaryRelay:"wss://city.example/",mirrorRelays:[]},10),creatorKey);
 const rotation=finalizeEvent(createCityDirectoryRotation(root,{signerPubkey:creator,nextOwnerPubkey:next},20),creatorKey);
 const request:OwnershipTransferAcceptance={version:1,requestId:"d5fca527-32d5-4a48-ae62-53820ddf90a3",origin:"https://bitcoinwalk.org",cityId,currentOwnerPubkey:creator,nextOwnerPubkey:next,rotationEventId:rotation.id,issuedAt:21,expiresAt:21+7*86400};
 const acceptance=finalizeEvent(ownershipTransferAcceptanceTemplate(request),nextKey);
 const record={event:{id:"a".repeat(64),created_at:9} as Event,grant:{cityId,creatorPubkey:creator,creatorRevisionId:"b".repeat(64),editorPubkeys:[creator,"c".repeat(64)],superAdminPubkey:SUPER_ADMIN_PUBKEY}} as AuthorizationRecord;
 return {root,rotation,acceptance,record,request};
}
describe("paid-city ownership transfer",()=>{
 it("derives the immutable anchor from the activated signed root",()=>{const f=fixture(),anchor=ownershipTransferAnchor(JSON.stringify(f.root),cityId);expect(anchor).toEqual({cityId,rootEventId:f.root.id,initialOwnerPubkey:creator});expect(()=>ownershipTransferAnchor("{}",cityId)).toThrow();});
 it("preserves creator provenance while making only the destination owner protected by default",()=>{const f=fixture(),template=transferredCityAuthorization({record:f.record,rotationEvent:f.rotation,acceptanceEvent:f.acceptance,requestId:f.request.requestId,origin:f.request.origin,now:30}),grant=JSON.parse(template.content);expect(grant).toMatchObject({version:2,creatorPubkey:creator,ownerPubkey:next,ownershipEventId:f.rotation.id,editorPubkeys:[next]});});
 it("can retain non-owner editors without retaining the former owner",()=>{const f=fixture(),grant=JSON.parse(transferredCityAuthorization({record:f.record,rotationEvent:f.rotation,acceptanceEvent:f.acceptance,requestId:f.request.requestId,origin:f.request.origin,retainEditors:true,now:30}).content);expect(grant.editorPubkeys).toEqual([next,"c".repeat(64)]);});
 it("rejects destination substitution and a non-rotation directory event",()=>{const f=fixture();expect(()=>transferredCityAuthorization({record:f.record,rotationEvent:f.rotation,acceptanceEvent:{...f.acceptance,pubkey:creator},requestId:f.request.requestId,origin:f.request.origin,now:30})).toThrow();expect(()=>transferredCityAuthorization({record:f.record,rotationEvent:{...f.rotation,content:f.rotation.content.replace('"action":"rotate"','"action":"update"')},acceptanceEvent:f.acceptance,requestId:f.request.requestId,origin:f.request.origin,now:30})).toThrow();});
});
