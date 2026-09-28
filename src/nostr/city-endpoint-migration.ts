import {normalizeRootWssRelay} from "./city-directory";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256=/^[0-9a-f]{64}$/;

export type EndpointMigrationSnapshot={
  url:string;
  cityId:string;
  readOnly:boolean;
  occurrenceIds:string[];
  allSignaturesValid:boolean;
  privateWrapperCount:number;
  tlsValid:boolean;
  nip11Readable:boolean;
  writePolicyVerified:boolean;
};

export type CityEndpointMigrationInput={
  cityId:string;
  production:boolean;
  signedCurrentEndpoints:string[];
  current:EndpointMigrationSnapshot;
  candidate:EndpointMigrationSnapshot;
  directoryConsensusVerified:boolean;
  separateFailureDomainVerified:boolean;
  rollback:{registryBackupSha256:string;journalBackupSha256:string;receiverBackupSha256:string};
};

export type MigrationGate={id:string;status:"passed"|"failed";detail:string};
export type CityEndpointMigrationReport={
  cityId:string;
  currentEndpoint:string;
  candidateEndpoint:string;
  eventCount:number;
  readyForSuccessorReview:boolean;
  createsOrPublishesEvent:false;
  gates:MigrationGate[];
};

function normalized(value:string){try{return normalizeRootWssRelay(value)}catch{return ""}}
function validEventIds(ids:string[]){return ids.length>0&&ids.every(id=>sha256.test(id))&&new Set(ids).size===ids.length&&ids.every((id,index)=>index===0||ids[index-1]<id)}
function sameValues(left:unknown,right:unknown){return JSON.stringify(left)===JSON.stringify(right)}

export function assessCityEndpointMigration(input:CityEndpointMigrationInput):CityEndpointMigrationReport{
  const currentEndpoint=normalized(input.current.url),candidateEndpoint=normalized(input.candidate.url);
  const signedEndpoints=input.signedCurrentEndpoints.map(normalized);
  const gates:MigrationGate[]=[];
  const gate=(id:string,passed:boolean,detail:string)=>gates.push({id,status:passed?"passed":"failed",detail});

  gate("city-scope",uuid.test(input.cityId)&&input.current.cityId===input.cityId&&input.candidate.cityId===input.cityId,"Both bounded audits must cover the exact immutable city UUID.");
  gate("current-binding",Boolean(currentEndpoint)&&signedEndpoints.includes(currentEndpoint),"The current audit endpoint must already be present in the accepted signed directory state.");
  gate("distinct-candidate",Boolean(candidateEndpoint)&&candidateEndpoint!==currentEndpoint&&!signedEndpoints.includes(candidateEndpoint),"The candidate must be a new normalized root WSS endpoint.");
  gate("read-only-evidence",input.current.readOnly===true&&input.candidate.readOnly===true,"Preflight evidence must be produced without signing, publishing or changing relay state.");
  gate("exact-public-state",validEventIds(input.current.occurrenceIds)&&validEventIds(input.candidate.occurrenceIds)&&sameValues(input.current.occurrenceIds,input.candidate.occurrenceIds),"Current and candidate must expose the same non-empty sorted set of exact signed occurrence IDs.");
  gate("public-event-policy",input.current.allSignaturesValid&&input.candidate.allSignaturesValid&&input.current.privateWrapperCount===0&&input.candidate.privateWrapperCount===0,"Both endpoints must contain valid public events and no private wrappers.");
  gate("candidate-transport",input.candidate.tlsValid&&input.candidate.nip11Readable,"The candidate must have valid public TLS and readable NIP-11 metadata.");
  gate("candidate-policy",input.candidate.writePolicyVerified,"The candidate write policy must be independently verified before directory review.");
  gate("directory-consensus",input.directoryConsensusVerified,"Every configured directory transport must resolve the same current signed event.");
  gate("failure-domain",input.separateFailureDomainVerified,"The operator must verify that the candidate provides the intended independent failure domain.");
  gate("rollback",Object.values(input.rollback).every(value=>sha256.test(value)),"Registry, journal and receiver rollback artifacts must have recorded SHA-256 digests.");
  gate("production-name",!input.production||Boolean(candidateEndpoint)&&!candidateEndpoint.includes("-staging"),"A production candidate must not retain a staging hostname.");

  return {cityId:input.cityId,currentEndpoint,candidateEndpoint,eventCount:input.candidate.occurrenceIds.length,readyForSuccessorReview:gates.every(item=>item.status==="passed"),createsOrPublishesEvent:false,gates};
}
