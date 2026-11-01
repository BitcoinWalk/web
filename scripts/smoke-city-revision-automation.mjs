const errors=[];
const original=console.error;
console.error=(...values)=>errors.push(values.join(" "));
delete process.env.BITCOINWALK_CITY_REVISION_AUTOMATION_ENVIRONMENT;
delete process.env.CREDENTIALS_DIRECTORY;
delete process.env.BITCOINWALK_PAYMENT_DATABASE;
process.exitCode=undefined;
const argument=process.argv[2];
process.argv[2]="--dry-run";
try{
 await import(new URL(`../release-build/city-revision-automation.cjs?smoke=${Date.now()}`,import.meta.url));
 await new Promise(resolve=>setImmediate(resolve));
}finally{
 if(argument===undefined)process.argv.splice(2,1);else process.argv[2]=argument;
 console.error=original;
}
if(process.exitCode!==1||!errors.includes("Run through the isolated city revision automation service."))throw new Error("Revision automation bundle failed its isolated startup check.");
process.exitCode=0;
console.log("City revision automation isolated startup: OK");
