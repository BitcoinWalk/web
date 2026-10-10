import {DatabaseSync} from "node:sqlite";
import {installNamedIdentity} from "../src/rustress/public-identity-store";

const [databasePath,localPart,brandPubkey]=process.argv.slice(2);
if(!databasePath||!localPart||!brandPubkey)throw new Error("Usage: install-named-nip05 <database> <name> <hex-pubkey>");
const db=new DatabaseSync(databasePath);
try{
  const result=installNamedIdentity(db,localPart,brandPubkey);
  process.stdout.write(JSON.stringify({created:result.created,localPart:result.identity?.localPart,brandPubkey:result.identity?.brandPubkey,evidenceHash:result.evidenceHash})+"\n");
}finally{db.close();}
