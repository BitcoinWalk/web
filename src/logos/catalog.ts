import {createHash} from "node:crypto";
import {lstat,readFile} from "node:fs/promises";
import {join} from "node:path";
import type {PaymentStore} from "../payments/service";
import type {LogoJob,LogoJobStore,LogoJobState} from "./approval-worker";
import {readGeneratedJobManifest,type LogoManifest} from "./job-runner";
import type {CityLogoVariant} from "./inkscape-source";

export type LogoPack={
  jobKey:string;cityId:string;revisionId:string;slug:string;cityName:string;state:"ready";
  publiclyListed:boolean;manifest:LogoManifest;
};
export type LogoPackStatus={
  jobKey:string;cityId:string;revisionId:string;slug:string;cityName:string;state:LogoJobState;
  attempts:number;updatedAt:number;publiclyListed:boolean;ready:boolean;
};
export type LogoFile={name:string;data:Buffer;mime:string;sha256:string;publiclyListed:boolean};
export type LogoVariantAsset={src:string;width:number;height:number};

export function logoVariantAsset(pack:LogoPack,variant:CityLogoVariant):LogoVariantAsset|null{
  const name=`${pack.slug}-${variant}.png`,file=pack.manifest.files.find(candidate=>candidate.name===name);
  return file?{src:`/api/city-logos/${pack.jobKey}/${name}`,width:file.width,height:file.height}:null;
}

function digest(value:Buffer){return createHash("sha256").update(value).digest("hex");}
function safeName(value:string){return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.png|-logos\.zip|\.json)$/.test(value)&&!value.includes("..");}

export class LogoCatalog{
  constructor(readonly jobs:LogoJobStore,readonly payments:PaymentStore){}
  private current(cityId:string,revisionId:string,slug:string):LogoJob|null{
    return this.jobs.rows().filter(row=>row.cityId===cityId&&row.revisionId===revisionId&&row.slug===slug&&row.state==="ready"&&row.artifactPath).sort((a,b)=>b.updatedAt-a.updatedAt)[0]??null;
  }
  private currentCity(cityId:string,slug:string):LogoJob|null{
    return this.jobs.rows().filter(row=>row.cityId===cityId&&row.slug===slug&&row.state==="ready"&&row.artifactPath).sort((a,b)=>b.updatedAt-a.updatedAt)[0]??null;
  }
  private async pack(job:LogoJob|null):Promise<LogoPack|null>{
    if(!job?.artifactPath)return null;
    const manifest=await readGeneratedJobManifest(job,job.artifactPath);
    return {jobKey:job.jobKey,cityId:job.cityId,revisionId:job.revisionId,slug:job.slug,cityName:job.cityName,state:"ready",publiclyListed:this.payments.entitled(job.cityId),manifest};
  }
  async ready(city:{cityId:string;revisionId:string;slug:string}):Promise<LogoPack|null>{
    return this.pack(this.current(city.cityId,city.revisionId,city.slug));
  }
  async readyForCity(city:{cityId:string;slug:string}):Promise<LogoPack|null>{
    return this.pack(this.currentCity(city.cityId,city.slug));
  }
  statuses():LogoPackStatus[]{return this.jobs.rows().map(job=>({jobKey:job.jobKey,cityId:job.cityId,revisionId:job.revisionId,slug:job.slug,cityName:job.cityName,state:job.state,attempts:job.attempts,updatedAt:job.updatedAt,publiclyListed:this.payments.entitled(job.cityId),ready:job.state==="ready"&&!!job.artifactPath}));}
  async file(jobKey:string,name:string):Promise<LogoFile|null>{
    if(!/^[a-f0-9]{64}$/.test(jobKey)||!safeName(name))return null;
    const job=this.jobs.get(jobKey);if(!job||job.state!=="ready"||!job.artifactPath)return null;
    const manifest=await readGeneratedJobManifest(job,job.artifactPath);
    const entry=name==="manifest.json"?{sha256:digest(Buffer.from(JSON.stringify(manifest)))}:[...manifest.files,manifest.archive].find(file=>file.name===name);
    if(!entry)return null;
    const path=join(job.artifactPath,name),metadata=await lstat(path);
    if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>20_000_000)return null;
    const data=await readFile(path);
    if(name!=="manifest.json"&&digest(data)!==entry.sha256)throw new Error("Generated logo checksum mismatch");
    return {name,data,mime:name.endsWith(".png")?"image/png":name.endsWith(".zip")?"application/zip":"application/json",sha256:digest(data),publiclyListed:this.payments.entitled(job.cityId)};
  }
}
