import {describe,expect,it,vi} from "vitest";
import {finalizeEvent} from "nostr-tools";
import {DEFAULT_FEATURE_FLAGS,FEATURE_FLAGS_ID} from "../domain/feature-flags";
import {createFeatureFlagsRevision,latestFeatureFlags,parseFeatureFlags} from "./feature-flags";
vi.mock("./authority",()=>({isSuperAdmin:()=>true,SUPER_ADMIN_PUBKEY:"test-admin"}));
const secret=new Uint8Array(32).fill(8);
describe("feature flags",()=>{
 it("fails closed by default",()=>{expect(DEFAULT_FEATURE_FLAGS.paidTierRegistration).toBe(false);});
 it("retains exact signed revisions",()=>{const first=finalizeEvent({...createFeatureFlagsRevision({paidTierRegistration:false}),created_at:1},secret);const second=finalizeEvent({...createFeatureFlagsRevision({paidTierRegistration:true,previousRevisionId:first.id}),created_at:2},secret);const rows=[first,second].map(parseFeatureFlags).filter(row=>row!==null);expect(latestFeatureFlags(rows)?.flags.paidTierRegistration).toBe(true);expect(parseFeatureFlags({...second,tags:[...second.tags,["extra","x"]]})).toBeNull();expect(second.tags.some(tag=>tag[0]==="i"&&tag[1]===FEATURE_FLAGS_ID)).toBe(true);});
});
