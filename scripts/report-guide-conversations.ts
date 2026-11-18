import {DatabaseSync} from "node:sqlite";
import {lstatSync} from "node:fs";
import {syncGuideConversations,guideConversationLeaderboard} from "../src/guide/conversation-leaderboard";

try{
 if(process.getuid?.()!==0||process.argv.length!==2)throw new Error("Run the Guide conversation report as root, without arguments.");
 const path="/var/lib/bitcoinwalk-guide/guide.sqlite";
 if(!lstatSync(path).isFile())throw new Error("Existing Guide database is required.");
 const db=new DatabaseSync(path);
 try{
  db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL");
  while(syncGuideConversations(db)===1000){/* Catch up retained history in bounded transactions. */}
  console.log(JSON.stringify({version:1,visibility:"admin-only",conversationInactivityHours:24,coverage:"retained-history-and-new-intake",rows:guideConversationLeaderboard(db)},null,2));
 }finally{db.close();}
}catch{console.error("Guide leaderboard could not be prepared. Run as root on Relays; no message contents are printed.");process.exitCode=1;}
