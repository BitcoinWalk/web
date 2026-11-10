import {describe,it,expect} from "vitest";
import {reviewedUpgradePolicy} from "./reviewed-upgrade";
import {persistentProDayPolicy} from "./persistent-pro";
import disabled from "../../deploy/guide/persistent-pro-disabled.json";

describe("reviewed matching upgrade",()=>{
 it("preserves activation, account, caps and daily grants",()=>{
  const old={...disabled,enabled:true,startsAt:1794260542};
  const next=reviewedUpgradePolicy(old,1794260600);
  expect(next).toEqual({...old,questionMatching:"reviewed-intents"});
  for(const now of [1794260600,1794347000])expect(persistentProDayPolicy(next,now)).toEqual(persistentProDayPolicy(old,now));
 });
 it("refuses disabled, already upgraded or different accounts",()=>{
  for(const change of [{enabled:false},{questionMatching:"reviewed-intents"},{recipient:"a".repeat(64)}])
   expect(()=>reviewedUpgradePolicy({...disabled,enabled:true,...change},1794260600)).toThrow();
 });
});
