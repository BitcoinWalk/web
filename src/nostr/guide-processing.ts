import type {Nip17Message} from "./nip17-inbox";

export type GuideConversationMessage=Nip17Message&{processingUntil?:number;processingFailed?:boolean};
/** Controls only affect this Guide's own reactions to this account's questions. */
export function guideConversation(events:Nip17Message[],actor:string,guide:string):GuideConversationMessage[]{
 const messages=events.filter(row=>!row.kind||row.kind===14),questions=new Set(messages.filter(row=>row.pubkey===actor&&row.recipient===guide).map(row=>row.id));
 const reactions=events.filter(row=>row.kind===7&&row.pubkey===guide&&row.recipient===actor&&row.content==="👀"&&questions.has(row.target??""));
 const deletions=events.filter(row=>row.kind===5&&row.pubkey===guide&&row.recipient===actor);
 const answered=new Set(messages.filter(row=>row.pubkey===guide&&row.recipient===actor).map(row=>row.target));
 return messages.map(message=>{
  if(!questions.has(message.id)||answered.has(message.id))return message;
  const reaction=reactions.filter(row=>row.target===message.id).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id))[0];
  if(!reaction)return message;
  const deletion=deletions.find(row=>row.target===reaction.id&&row.createdAt>=reaction.createdAt);
  if(deletion)return deletion.content?{...message,processingFailed:true}:message;
  return {...message,processingUntil:reaction.expiresAt};
 });
}
