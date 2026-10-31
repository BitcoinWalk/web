import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import type {AuthorizationRecord} from "./city-records";
import {createCityEditorRequest,parseCityEditorRequest,pendingCityEditorRequests} from "./city-editor-requests";

const ownerKey=generateSecretKey(),owner=getPublicKey(ownerKey),editor=getPublicKey(generateSecretKey()),cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f";
const record=(editors=[owner]):AuthorizationRecord=>({event:{id:"a".repeat(64),created_at:1} as AuthorizationRecord["event"],grant:{cityId,creatorPubkey:owner,creatorRevisionId:"b".repeat(64),editorPubkeys:editors,superAdminPubkey:"c".repeat(64)}});

describe("city editor requests",()=>{
  it("creates and parses an owner-signed add request bound to the current grant",()=>{
    const template=createCityEditorRequest(record(),owner,"add",editor,2),event=finalizeEvent(template,ownerKey),parsed=parseCityEditorRequest(event);
    expect(parsed?.request).toMatchObject({cityId,action:"add",editorPubkey:editor,authorizationEventId:"a".repeat(64)});
    expect(pendingCityEditorRequests([parsed!],[record()])).toHaveLength(1);
  });
  it("rejects non-owners and protected or already-applied changes",()=>{
    expect(()=>createCityEditorRequest(record(),editor,"add",editor,2)).toThrow("current city owner");
    expect(()=>createCityEditorRequest(record(),owner,"remove",owner,2)).toThrow("must remain");
    const event=finalizeEvent(createCityEditorRequest(record(),owner,"add",editor,2),ownerKey),parsed=parseCityEditorRequest(event)!;
    expect(pendingCityEditorRequests([parsed],[record([owner,editor])])).toEqual([]);
  });
});
