import {startRemoteJournal} from "./remote-journal-runtime";

// Only a directory path is accepted, never a credential on the command line.
async function main(){
 if(process.argv.length!==3)throw new Error("Private state directory required");
 const service=await startRemoteJournal(process.argv[2]);
 console.log("Private journal listening on loopback; startup state paused.");
 let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;void service.close().then(()=>process.exit(0),()=>process.exit(1));};
 process.on("SIGTERM",stop);process.on("SIGINT",stop);
}
void main().catch(()=>{console.error("Journal startup refused. Check runtime, private storage, credentials, port and exclusive lock.");process.exitCode=1;});
