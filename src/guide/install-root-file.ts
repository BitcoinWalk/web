import {copyFileSync,chownSync,chmodSync} from "node:fs";

/** Explicit ownership is required: copying a release file is not an ownership guarantee. */
export function installGuideRootFile(source:string,target:string,mode:number){
 copyFileSync(source,target);chownSync(target,0,0);chmodSync(target,mode);
}
