import {describe,expect,it,vi} from "vitest";
vi.mock("../nostr/authority",()=>({isSuperAdmin:(key:string)=>key==="admin"}));
vi.mock("../nostr/editor-management",()=>({latestCityGrants:(records:unknown[])=>records}));
vi.mock("../nostr/moderation",()=>({managedCities:(revisions:unknown[])=>revisions}));
import {brandStudioAccess} from "./brand-studio-access";

const approved=(cityId:string,name:string,owner:string)=>({state:"approved",revision:{city:{cityId,cityName:name},event:{pubkey:owner}}});
const grant=(cityId:string,creatorPubkey:string,editorPubkeys:string[]=[])=>({grant:{cityId,creatorPubkey,editorPubkeys}});

describe("brand studio access",()=>{
 it("allows the super-admin",()=>expect(brandStudioAccess("admin",[],[],[])).toMatchObject({allowed:true,role:"super-admin"}));
 it("allows the creator of a currently approved city",()=>expect(brandStudioAccess("owner",[approved("a","Madeira","city-key")] as never,[],[grant("a","owner")] as never)).toEqual({allowed:true,role:"organizer",cities:["Madeira"]}));
 it("does not treat an editor as an organizer",()=>expect(brandStudioAccess("editor",[approved("a","Madeira","city-key")] as never,[],[grant("a","owner",["owner","editor"])] as never)).toEqual({allowed:false,role:"none",cities:[]}));
 it("supports an approved legacy city whose owner has no authorization record",()=>expect(brandStudioAccess("owner",[approved("a","London","owner")] as never,[],[])).toEqual({allowed:true,role:"organizer",cities:["London"]}));
});
