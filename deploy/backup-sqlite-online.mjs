import {backup,DatabaseSync} from "node:sqlite";
import {realpath} from "node:fs/promises";

if(process.argv.length!==4)throw new Error("Usage: backup-sqlite-online.mjs SOURCE DESTINATION");
const sourcePath=await realpath(process.argv[2]);
const destinationPath=process.argv[3];
const source=new DatabaseSync(sourcePath,{readOnly:true});
try{
  await backup(source,destinationPath);
}finally{
  source.close();
}
const destination=new DatabaseSync(destinationPath,{readOnly:true});
try{
  const result=destination.prepare("PRAGMA integrity_check").get();
  if(!result||Object.values(result)[0]!=="ok")throw new Error("SQLite backup integrity check failed");
}finally{
  destination.close();
}
