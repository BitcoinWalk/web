import {DatabaseSync} from "node:sqlite";
import {expect,it} from "vitest";
import {nip19} from "nostr-tools";
import {GuideSupportCases} from "./support";
import {syncGuideConversations,guideConversationLeaderboard,GUIDE_CONVERSATION_GAP} from "./conversation-leaderboard";

function setup(){
 const db=new DatabaseSync(":memory:");new GuideSupportCases(db);let sequence=0;
 db.prepare("INSERT INTO support_case(id,sender,state,opened_at,updated_at) VALUES ('case',?,'open',0,0)").run("a".repeat(64));
 const add=(sender:string,receivedAt:number)=>{
  const id=(++sequence).toString(16).padStart(64,"0");
  db.prepare("INSERT INTO support_message VALUES (?,?,?,?,?,?,?)").run(id,"case",id,sender,"PRIVATE CONTENT MUST NOT APPEAR",receivedAt,receivedAt);return id;
 };
 return {db,add};
}
it("ranks distinct sessions after 24 hours of inactivity, not messages or support-case closures",()=>{
 const s=setup(),a="a".repeat(64),b="b".repeat(64);try{
  s.add(a,1);s.add(a,100);s.add(b,101);s.add(a,100+GUIDE_CONVERSATION_GAP-1);s.add(b,101+GUIDE_CONVERSATION_GAP);syncGuideConversations(s.db);
  const rows=guideConversationLeaderboard(s.db);expect(rows).toEqual([{rank:1,npub:nip19.npubEncode(b),conversations:2},{rank:2,npub:nip19.npubEncode(a),conversations:1}]);
  expect(JSON.stringify(rows)).not.toContain("PRIVATE");expect(syncGuideConversations(s.db)).toBe(0);
 }finally{s.db.close();}
});
it("preserves counts after message pruning, process restarts and receipt replay",()=>{
 const s=setup(),a="a".repeat(64);try{
  const id=s.add(a,10);syncGuideConversations(s.db);s.db.exec("DELETE FROM support_message");syncGuideConversations(s.db);
  s.db.prepare("INSERT INTO support_message VALUES (?,?,?,?,?,?,?)").run(id,"case",id,a,"replayed",10,10);
  expect(syncGuideConversations(s.db)).toBe(0);s.add(a,10+GUIDE_CONVERSATION_GAP);syncGuideConversations(s.db);
  expect(guideConversationLeaderboard(s.db)[0].conversations).toBe(2);
  expect(()=>guideConversationLeaderboard(s.db,101)).toThrow();
 }finally{s.db.close();}
});
it("rolls back receipts and aggregates together on corrupt metadata",()=>{
 const s=setup();try{
  s.add("a".repeat(64),1);s.add("invalid",2);expect(()=>syncGuideConversations(s.db)).toThrow();
  expect(s.db.prepare("SELECT COUNT(*) count FROM guide_conversation_counted").get()).toMatchObject({count:0});
  expect(s.db.prepare("SELECT COUNT(*) count FROM guide_conversation_totals").get()).toMatchObject({count:0});
 }finally{s.db.close();}
});
