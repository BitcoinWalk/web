import {readFileSync,existsSync} from "node:fs";
const [candidatePath,currentPath,profile,release]=process.argv.slice(2);
const candidate=JSON.parse(readFileSync(candidatePath,"utf8"));
if(candidate.schema!==1||candidate.profile!==profile||candidate.release!==`app-${profile}-${release}`||
 !/^[a-f0-9]{40}$/.test(candidate.sourceCommit)||!Array.isArray(candidate.ancestors)||
 !candidate.ancestors.includes(candidate.sourceCommit))throw new Error("Invalid release provenance.");
if(existsSync(currentPath)){
 const current=JSON.parse(readFileSync(currentPath,"utf8"));
 if(!candidate.ancestors.includes(current.sourceCommit))throw new Error("Candidate omits the active release source. Merge it before deployment.");
}
