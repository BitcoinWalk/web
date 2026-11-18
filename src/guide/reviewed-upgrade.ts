import assert from "node:assert/strict";
import {persistentProPolicySchema,persistentProDayPolicy,persistentProGroupPolicySchema,persistentProAccounts} from "./persistent-pro";

/** Matching changes must never create a fresh daily grant. */
export function reviewedUpgradePolicy(value:unknown,now:number){
 const previous=persistentProPolicySchema.parse(value);
 assert(previous.enabled&&previous.questionMatching==="exact");
 const next={...previous,questionMatching:"reviewed-intents" as const};
 assert.deepEqual(persistentProDayPolicy(previous,now),persistentProDayPolicy(next,now));
 return next;
}

export function twoProUpgradePolicy(value:unknown,now:number){
 const previous=persistentProGroupPolicySchema.parse(value);
 assert(previous.enabled&&previous.questionMatching==="reviewed-intents"&&previous.additionalProStartsAt===undefined);
 const next={...previous,additionalProStartsAt:now+2};
 assert.deepEqual(persistentProAccounts(next)[0],persistentProAccounts(previous)[0]);
 assert.deepEqual(persistentProDayPolicy(persistentProAccounts(next)[0],now),persistentProDayPolicy(persistentProAccounts(previous)[0],now));
 return next;
}
