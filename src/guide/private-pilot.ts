import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import type {Event} from "nostr-tools";
import {GuideSupportCases,type SupportMessage} from "./support";
import type {GuideDraft} from "./assistant";
import {guideEvaluationCases,checkGuideEvaluation,type GuideEvaluationCheck} from "./evaluation";
import {prepareReviewedReply,reviewedReplySchema} from "./reviewed-reply";
import {initializeGuideLimits,assertGuideAllowance,acknowledgeGuideReply,GuideCooldownError,type GuidePlan} from "./support-limits";
import {GuideProcessingReactions} from "./processing-reaction";

export const privatePilotPolicySchema=z.object({
 version:z.literal(1),id:z.string().regex(/^[a-z0-9-]{1,64}$/),enabled:z.boolean().default(false),
 recipient:z.string().regex(/^[0-9a-f]{64}$/),environment:z.enum(["staging","production"]),
 startsAt:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative(),
 maxCalls:z.number().int().min(1).max(10),maxDeliveries:z.number().int().min(1).max(5),
 model:z.literal("gpt-6.1-sol"),
 promptSha256:z.literal("335afa40b9fda4f0bc1b8daaa78fe8b094e949987fd763195bcfceb049036ff4"),
 knowledgeSha256:z.literal("ba4596406565803282059f3d33f7b3cece7f5fb9f0f6a0f746b1e8e30c7feaa7"),
 suiteSha256:z.literal("6f4c3c126f233e0ffe59ed5b5c7836aaa083e67c4681882f78ac11b098ce5b76"),
}).strict();
export type PrivatePilotPolicy=z.infer<typeof privatePilotPolicySchema>;
type Attempt={phase:string;review:string|null};
export type PrivatePilotDependencies={
 admitQuestion?:(content:string)=>GuideEvaluationCheck;
 processingReactions?:boolean;
 readPolicy:()=>unknown;now:()=>number;
 plan:(recipient:string)=>Promise<GuidePlan>;
 draft:(message:SupportMessage)=>Promise<GuideDraft>;
 discover:(recipient:string)=>Promise<string[]>;
 publish:(event:Event,relays:string[])=>Promise<void>;
};
type Dependencies=PrivatePilotDependencies;
export function initializePrivatePilotState(db:DatabaseSync){
 initializeGuideLimits(db);
 db.exec("CREATE TABLE IF NOT EXISTS guide_private_pilot_policy(id TEXT PRIMARY KEY,digest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS guide_private_pilot_attempt(policy_id TEXT NOT NULL,case_id TEXT NOT NULL,message_key TEXT NOT NULL,phase TEXT NOT NULL,review TEXT,PRIMARY KEY(policy_id,case_id,message_key))");
}
function hash(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function policyDigest(policy:PrivatePilotPolicy){return hash({...policy,enabled:false});}
function normalize(value:string){return value.trim().replace(/\s+/g," ").toLowerCase();}

export async function watchPrivatePilot(db:DatabaseSync,secret:Uint8Array,deps:Dependencies,wait:()=>Promise<boolean>,report:(result:unknown)=>void){
 const initial=privatePilotPolicySchema.parse(deps.readPolicy());
 do{
  const current=privatePilotPolicySchema.parse(deps.readPolicy());
  if(!current.enabled||deps.now()>=current.expiresAt)return;
  if(policyDigest(current)!==policyDigest(initial))throw new Error("Private pilot grant changed; restart requires review.");
  if(deps.now()>=current.startsAt){
   const threshold=Math.max(current.startsAt,deps.now()-300);
   const row=db.prepare("SELECT c.id FROM support_case c WHERE c.sender=? AND c.state='open' AND c.updated_at>=? AND EXISTS (SELECT 1 FROM support_message m WHERE m.case_id=c.id AND m.created_at>=? AND m.received_at>=?) ORDER BY c.updated_at DESC,c.id LIMIT 1").get(current.recipient,threshold,threshold,threshold) as {id:string}|undefined;
   if(row)report(await runPrivatePilotCase(db,row.id,secret,deps));
  }
 }while(await wait());
}

// This companion is never called by the notification/intake worker.
export async function runPrivatePilotCase(db:DatabaseSync,caseId:string,secret:Uint8Array,deps:Dependencies){
 try{return await runPrivatePilotCaseWithReactions(db,caseId,secret,deps);}
 catch(error){if(error instanceof GuideCooldownError)return {state:"cooldown-blocked" as const,resumeAt:error.resumeAt,sent:false};throw error;}
}

async function runPrivatePilotCaseWithReactions(db:DatabaseSync,caseId:string,secret:Uint8Array,deps:Dependencies){
 if(!deps.processingReactions)return runPrivatePilotCaseWithoutReactions(db,caseId,secret,deps);
 const initial=privatePilotPolicySchema.parse(deps.readPolicy());
 if(!initial.enabled||deps.now()<initial.startsAt||deps.now()>=initial.expiresAt)return runPrivatePilotCaseWithoutReactions(db,caseId,secret,deps);
 const reactions=new GuideProcessingReactions(db,secret,deps);
 let started:string|undefined,completed=false;
 try{
  const result=await runPrivatePilotCaseWithoutReactions(db,caseId,secret,{...deps,draft:async message=>{
   const check=()=>{
    const current=privatePilotPolicySchema.parse(deps.readPolicy());
    if(!current.enabled||deps.now()>=current.expiresAt||policyDigest(current)!==policyDigest(initial))throw new Error("Private pilot disabled, expired or changed.");
    const latest=new GuideSupportCases(db).messages(caseId).at(-1);
    if(latest?.id!==message.id||message.receivedAt<deps.now()-300||message.createdAt<deps.now()-300)throw new Error("Private pilot case changed or became stale.");
   };
   check();
   started=message.id;
   // A reaction transport failure must never suppress the actual answer.
   try{await reactions.start(message.id,message.sender,check);}catch{console.warn("Guide processing reaction could not be acknowledged.");}
   check();
   const plan=await deps.plan(initial.recipient);check();
   if(plan!=="basic"&&plan!=="pro")throw new Error("Private pilot plan is unavailable.");
   assertGuideAllowance(db,initial.recipient,plan,deps.now());
   return deps.draft(message);
  }});
  completed=result.state==="sent"||result.state==="already-sent";
  return result;
 }finally{
  if(started)try{await reactions.clear(started,!completed);}catch{console.warn("Guide processing cleanup retained for exact retry.");}
 }
}

async function runPrivatePilotCaseWithoutReactions(db:DatabaseSync,caseId:string,secret:Uint8Array,deps:Dependencies){
 const policy=privatePilotPolicySchema.parse(deps.readPolicy());
 const gate=()=>{
  const current=privatePilotPolicySchema.parse(deps.readPolicy()),now=deps.now();
  if(!current.enabled)throw new Error("Private pilot disabled.");
  if(policyDigest(current)!==policyDigest(policy))throw new Error("Private pilot policy changed.");
  if(current.expiresAt<=current.startsAt||current.expiresAt-current.startsAt>86400||now<current.startsAt||now>=current.expiresAt)throw new Error("Private pilot outside its time window.");
 };
 gate();
 const store=new GuideSupportCases(db),row=db.prepare("SELECT sender,state FROM support_case WHERE id=?").get(caseId) as {sender:string;state:string}|undefined;
 if(!row||row.state!=="open"||row.sender!==policy.recipient)throw new Error("Private pilot recipient is not admitted.");
 const messages=store.messages(caseId),latest=messages.at(-1),messageIds=messages.map(message=>message.id),messageKey=hash(messageIds);
 const checkSnapshot=()=>{
  gate();
  if(latest&&(latest.receivedAt<deps.now()-300||latest.createdAt<deps.now()-300))throw new Error("Private pilot message became stale.");
  const current=db.prepare("SELECT sender,state FROM support_case WHERE id=?").get(caseId) as {sender:string;state:string}|undefined;
  if(current?.sender!==policy.recipient||current.state!=="open"||hash(store.messages(caseId).map(message=>message.id))!==messageKey)throw new Error("Private pilot case changed.");
 };
 if(!latest||latest.createdAt<policy.startsAt||latest.receivedAt<policy.startsAt||latest.receivedAt<deps.now()-300||latest.createdAt<deps.now()-300||latest.receivedAt>deps.now()||latest.createdAt>deps.now()+60||messages.some(message=>message.receivedAt>latest.receivedAt))throw new Error("Private pilot requires a fresh latest message.");
 const test=deps.admitQuestion?deps.admitQuestion(latest.content):guideEvaluationCases.find(test=>!test.escalate&&normalize(test.content)===normalize(latest.content));
 if(!test)return {state:"needs-review" as const,sent:false};
 initializePrivatePilotState(db);
 const attempt=()=>db.prepare("SELECT phase,review FROM guide_private_pilot_attempt WHERE policy_id=? AND case_id=? AND message_key=?").get(policy.id,caseId,messageKey) as Attempt|undefined;
 const mark=(phase:string,review:string|null)=>db.prepare("UPDATE guide_private_pilot_attempt SET phase=?,review=? WHERE policy_id=? AND case_id=? AND message_key=?").run(phase,review,policy.id,caseId,messageKey);
 const verifiedPlan=async()=>{
  const plan=await deps.plan(policy.recipient);checkSnapshot();
  if(plan!=="basic"&&plan!=="pro")throw new Error("Private pilot plan is unavailable.");return plan;
 };
 const transaction=(work:()=>void)=>{db.exec("BEGIN IMMEDIATE");try{work();db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}};
 transaction(()=>{
  const saved=db.prepare("SELECT digest FROM guide_private_pilot_policy WHERE id=?").get(policy.id) as {digest:string}|undefined;
  if(saved&&saved.digest!==policyDigest(policy))throw new Error("Private pilot ID cannot reset its limits.");
  db.prepare("INSERT OR IGNORE INTO guide_private_pilot_policy VALUES (?,?)").run(policy.id,policyDigest(policy));
 });
 let saved=attempt();
 if(saved?.phase==="sent")return {state:"already-sent" as const,sent:false};
 if(saved&&!saved.review)return {state:"needs-review" as const,sent:false};
 let plan=await verifiedPlan();
 if(!saved){
  let reserved=false;
  transaction(()=>{
   if(attempt())return;
   const active=db.prepare("SELECT 1 FROM guide_private_pilot_attempt WHERE policy_id=? AND phase='drafting'").get(policy.id);
   if(active)throw new Error("Private pilot model request already in progress.");
   const counts=db.prepare("SELECT COUNT(*) calls,COUNT(review) deliveries FROM guide_private_pilot_attempt WHERE policy_id=?").get(policy.id) as {calls:number;deliveries:number};
   if(counts.calls>=policy.maxCalls||counts.deliveries>=policy.maxDeliveries)throw new Error("Private pilot usage cap reached.");
   assertGuideAllowance(db,policy.recipient,plan,deps.now());
   db.prepare("INSERT INTO guide_private_pilot_attempt VALUES (?,?,?,'drafting',NULL)").run(policy.id,caseId,messageKey);reserved=true;
  });
  if(!reserved)return {state:"needs-review" as const,sent:false};
  try{
   checkSnapshot();
   // Only this admitted public FAQ enters the model, never earlier private messages.
   const draft=await deps.draft({...latest,content:test.content});checkSnapshot();
   checkGuideEvaluation(test,draft);
   const review=reviewedReplySchema.parse({caseId,messageIds,reply:draft.draft+"\n\nGuide: "+draft.citations.join("\n")});
   plan=await verifiedPlan();
   transaction(()=>{
    const count=db.prepare("SELECT COUNT(review) count FROM guide_private_pilot_attempt WHERE policy_id=?").get(policy.id) as {count:number};
    if(count.count>=policy.maxDeliveries)throw new Error("Private pilot delivery cap reached.");
    mark("approved",JSON.stringify(review));
   });
  }catch(error){mark("held",null);throw error;}
  saved=attempt();
 }
 if(!saved?.review)throw new Error("Private pilot has no admitted draft.");
 const review=reviewedReplySchema.parse(JSON.parse(saved.review));
 checkSnapshot();
 let reply=prepareReviewedReply(db,review,secret,plan,deps.now());
 if(!reply.acknowledged){
  const relays=await deps.discover(policy.recipient);checkSnapshot();
  if(!relays.length)throw new Error("Private pilot inbox is unavailable.");
  plan=await verifiedPlan();
  reply=prepareReviewedReply(db,review,secret,plan,deps.now());checkSnapshot();
  if(!reply.acknowledged){await deps.publish(reply.wrapped,relays);acknowledgeGuideReply(db,reply.reviewKey,deps.now());}
 }
 mark("sent",saved.review);
 return {state:"sent" as const,eventId:reply.wrapped.id,relayAcknowledged:true,readReceipt:false};
}
