import assert from "node:assert/strict";
import {persistentProPolicySchema,persistentProDayPolicy} from "./persistent-pro";

/** Matching changes must never create a fresh daily grant. */
export function reviewedUpgradePolicy(value:unknown,now:number){
 const previous=persistentProPolicySchema.parse(value);
 assert(previous.enabled&&previous.questionMatching==="exact");
 const next={...previous,questionMatching:"reviewed-intents" as const};
 assert.deepEqual(persistentProDayPolicy(previous,now),persistentProDayPolicy(next,now));
 return next;
}
