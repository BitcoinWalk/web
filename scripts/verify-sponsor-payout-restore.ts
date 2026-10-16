import {DatabaseSync} from "node:sqlite";
const path=process.argv[2];
try{
 if(!path)throw new Error();const db=new DatabaseSync(path,{readOnly:true}),integrity=db.prepare("PRAGMA integrity_check").get() as Record<string,unknown>,row=db.prepare("SELECT mode,generation FROM sponsor_payout_service_state WHERE singleton=1").get() as {mode:string;generation:number}|undefined;db.close();
 if(Object.values(integrity)[0]!=="ok"||row?.mode!=="disabled"||!Number.isSafeInteger(row.generation)||row.generation<1)throw new Error();
 process.stdout.write("SPONSOR_PAYOUT_RESTORE_OK\n");
}catch{process.stderr.write("Sponsor payout restore verification failed.\n");process.exitCode=1;}
