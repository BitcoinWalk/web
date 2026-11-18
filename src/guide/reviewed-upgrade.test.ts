import {describe,it,expect} from "vitest";
import {reviewedUpgradePolicy,twoProUpgradePolicy} from "./reviewed-upgrade";
import {persistentProDayPolicy,persistentProAccounts,GUIDE_SECOND_PRO_RECIPIENT} from "./persistent-pro";
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
 it("adds only the selected second account and preserves the original grant",()=>{
  const old={...disabled,enabled:true,startsAt:1794260542,questionMatching:"reviewed-intents"};
  const next=twoProUpgradePolicy(old,1794260600),accounts=persistentProAccounts(next);
  expect(accounts).toHaveLength(2);expect(accounts[0]).toEqual(old);
  expect(accounts[1]).toEqual({...old,recipient:GUIDE_SECOND_PRO_RECIPIENT,startsAt:1794260602});
  expect(persistentProDayPolicy(accounts[0],1794260600)).toEqual(persistentProDayPolicy(old,1794260600));
  expect(persistentProDayPolicy(accounts[0],1794260600).id).not.toBe(persistentProDayPolicy(accounts[1],1794260600).id);
  expect(()=>twoProUpgradePolicy(next,1794260700)).toThrow();
 });
});
