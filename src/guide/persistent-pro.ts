import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {privatePilotPolicySchema,initializePrivatePilotState,runPrivatePilotCase,type PrivatePilotDependencies} from "./private-pilot";
import {GuideSupportCases} from "./support";
import {reviewedGuideQuestion,reviewedGuideStaticAnswer} from "./reviewed-questions";

export const GUIDE_PERSISTENT_PRO_RECIPIENT="74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0";
export const GUIDE_SECOND_PRO_RECIPIENT="36ca79311b889f0f4fab32eb849d20d07cfdbc4e0519319226c78a27c751722e";
export const persistentProPolicySchema=privatePilotPolicySchema.omit({id:true,version:true,expiresAt:true}).extend({
 version:z.literal(2),recipient:z.enum([GUIDE_PERSISTENT_PRO_RECIPIENT,GUIDE_SECOND_PRO_RECIPIENT]),environment:z.literal("production"),requirePro:z.literal(true),maxCalls:z.literal(10),maxDeliveries:z.literal(5),questionMatching:z.enum(["exact","reviewed-intents"]).default("exact"),
}).strict();
export const persistentProGroupPolicySchema=persistentProPolicySchema.extend({recipient:z.literal(GUIDE_PERSISTENT_PRO_RECIPIENT),additionalProStartsAt:z.number().int().positive().optional()});
export function persistentProAccounts(value:unknown){
 const {additionalProStartsAt,...primary}=persistentProGroupPolicySchema.parse(value);
 return additionalProStartsAt===undefined?[primary]:[primary,{...primary,recipient:GUIDE_SECOND_PRO_RECIPIENT,startsAt:additionalProStartsAt}];
}
export type PersistentProPolicy=z.infer<typeof persistentProPolicySchema>;
type Dependencies=Omit<PrivatePilotDependencies,"readPolicy">&{readPolicy:()=>unknown};
function digest(policy:PersistentProPolicy){return createHash("sha256").update(JSON.stringify({...policy,enabled:false})).digest("hex");}

/** A stable UTC-day grant reuses the tested durable caps; a restart cannot refill it. */
export function persistentProDayPolicy(value:unknown,now:number){
 const policy=persistentProPolicySchema.parse(value),day=Math.floor(now/86400)*86400;
 const fields=persistentProPolicySchema.omit({requirePro:true,questionMatching:true}).strip().parse(policy);
 return privatePilotPolicySchema.parse({...fields,version:1,id:`bw152-live-pro-${policy.recipient===GUIDE_SECOND_PRO_RECIPIENT?"second-":""}${new Date(day*1000).toISOString().slice(0,10).replaceAll("-","")}`,startsAt:Math.max(day,policy.startsAt),expiresAt:day+86400});
}

/** Call only after obtaining the service's exclusive lock. Never repeat an uncertain model call. */
export function recoverPersistentPro(db:DatabaseSync){
 initializePrivatePilotState(db);
 db.prepare("UPDATE guide_private_pilot_attempt SET phase='held' WHERE (policy_id GLOB 'bw152-live-pro-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' OR policy_id GLOB 'bw152-live-pro-second-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]') AND phase='drafting' AND review IS NULL").run();
}

export async function persistentProTick(db:DatabaseSync,secret:Uint8Array,deps:Dependencies){
 const initial=persistentProPolicySchema.parse(deps.readPolicy());
 if(!initial.enabled)return {state:"disabled" as const,sent:false};
 if(deps.now()<initial.startsAt)return {state:"not-started" as const,sent:false};
 initializePrivatePilotState(db);
 const policy=persistentProDayPolicy(initial,deps.now()),threshold=Math.max(policy.startsAt,deps.now()-300);
 const row=db.prepare("SELECT c.id FROM support_case c WHERE c.sender=? AND c.state='open' AND c.updated_at>=? AND EXISTS (SELECT 1 FROM support_message m WHERE m.case_id=c.id AND m.created_at>=? AND m.received_at>=?) ORDER BY c.updated_at DESC,c.id LIMIT 1").get(policy.recipient,threshold,threshold,threshold) as {id:string}|undefined;
 if(!row)return {state:"idle" as const,sent:false};
 const ids=new GuideSupportCases(db).messages(row.id).map(message=>message.id),key=createHash("sha256").update(JSON.stringify(ids)).digest("hex");
 const saved=db.prepare("SELECT phase,review FROM guide_private_pilot_attempt WHERE policy_id=? AND case_id=? AND message_key=?").get(policy.id,row.id,key) as {phase:string;review:string|null}|undefined;
 if(!saved){
  const counts=db.prepare("SELECT COUNT(*) calls,COUNT(review) replies FROM guide_private_pilot_attempt WHERE policy_id=?").get(policy.id) as {calls:number;replies:number};
  if(counts.calls>=policy.maxCalls||counts.replies>=policy.maxDeliveries)return {state:"daily-limit" as const,resumeAt:policy.expiresAt,sent:false};
 }
 return runPrivatePilotCase(db,row.id,secret,{
  ...deps,processingReactions:true,
  ...(initial.questionMatching==="reviewed-intents"?{admitQuestion:reviewedGuideQuestion,draft:async(message:Parameters<PrivatePilotDependencies["draft"]>[0])=>reviewedGuideStaticAnswer(message.content)??deps.draft(message)}:{}),
  readPolicy:()=>{
   const current=persistentProPolicySchema.parse(deps.readPolicy());
   if(digest(current)!==digest(initial))throw new Error("Persistent Guide policy changed; restart for review.");
   return persistentProDayPolicy(current,deps.now());
  },
  plan:async recipient=>{const plan=await deps.plan(recipient);if(plan!=="pro")throw new Error("Persistent Guide requires verified Pro entitlement.");return plan;},
 });
}
