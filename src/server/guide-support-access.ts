import {cityOwnerPubkey} from "../domain/city";
import {proSetupDependencies,resolveProSetupAuthority} from "./pro-setup";

export async function guideSupportPlan(recipient:string,deps={grants:proSetupDependencies.grants,resolve:resolveProSetupAuthority}):Promise<"basic"|"pro">{
 const grants=await deps.grants();
 for(const record of grants.filter(record=>record.grant.editorPubkeys.includes(recipient))){
  try{
   const resolved=await deps.resolve(record.grant.cityId,cityOwnerPubkey(record.grant));
   if(resolved.grant.grant.editorPubkeys.includes(recipient))return "pro";
  }catch(error){
   const message=error instanceof Error?error.message:"";
   if(["An approved city and verified creator authorization","A settled Pro entitlement","City or organizer publishing is suspended","Only the current city owner"].some(prefix=>message.startsWith(prefix)))continue;
   throw error;
  }
 }
 return "basic";
}
