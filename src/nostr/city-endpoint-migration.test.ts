import {describe,expect,it} from "vitest";
import {assessCityEndpointMigration,type CityEndpointMigrationInput} from "./city-endpoint-migration";

const cityId="be8514a4-9df0-4159-a517-71f65761cbbe";
const eventIds=["1".repeat(64),"2".repeat(64)];
const digest="a".repeat(64);

function acceptedInput():CityEndpointMigrationInput{
  return {
    cityId,
    production:true,
    signedCurrentEndpoints:["wss://replica-staging.bitcoinwalk.org/"],
    current:{url:"wss://replica-staging.bitcoinwalk.org/",cityId,readOnly:true,occurrenceIds:eventIds,allSignaturesValid:true,privateWrapperCount:0,tlsValid:true,nip11Readable:true,writePolicyVerified:true},
    candidate:{url:"wss://replica.bitcoinwalk.org/",cityId,readOnly:true,occurrenceIds:eventIds,allSignaturesValid:true,privateWrapperCount:0,tlsValid:true,nip11Readable:true,writePolicyVerified:true},
    directoryConsensusVerified:true,
    separateFailureDomainVerified:true,
    rollback:{registryBackupSha256:digest,journalBackupSha256:digest,receiverBackupSha256:digest},
  };
}

describe("city endpoint migration preflight",()=>{
  it("accepts exact, policy-verified production evidence for successor review",()=>{
    const report=assessCityEndpointMigration(acceptedInput());
    expect(report.readyForSuccessorReview).toBe(true);
    expect(report.currentEndpoint).toBe("wss://replica-staging.bitcoinwalk.org/");
    expect(report.candidateEndpoint).toBe("wss://replica.bitcoinwalk.org/");
    expect(report.eventCount).toBe(2);
    expect(report.gates.every(gate=>gate.status==="passed")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it.each([
    ["same endpoint",(input:CityEndpointMigrationInput)=>{input.candidate.url=input.current.url},"distinct-candidate"],
    ["wrong city",(input:CityEndpointMigrationInput)=>{input.candidate.cityId="586c0d1f-e861-4c8f-858c-ce3e2bfaf384"},"city-scope"],
    ["event mismatch",(input:CityEndpointMigrationInput)=>{input.candidate.occurrenceIds=[eventIds[0]]},"exact-public-state"],
    ["invalid signature",(input:CityEndpointMigrationInput)=>{input.candidate.allSignaturesValid=false},"public-event-policy"],
    ["private wrapper",(input:CityEndpointMigrationInput)=>{input.candidate.privateWrapperCount=1},"public-event-policy"],
    ["missing TLS",(input:CityEndpointMigrationInput)=>{input.candidate.tlsValid=false},"candidate-transport"],
    ["missing NIP-11",(input:CityEndpointMigrationInput)=>{input.candidate.nip11Readable=false},"candidate-transport"],
    ["unverified writes",(input:CityEndpointMigrationInput)=>{input.candidate.writePolicyVerified=false},"candidate-policy"],
    ["directory disagreement",(input:CityEndpointMigrationInput)=>{input.directoryConsensusVerified=false},"directory-consensus"],
    ["shared failure domain",(input:CityEndpointMigrationInput)=>{input.separateFailureDomainVerified=false},"failure-domain"],
    ["missing rollback",(input:CityEndpointMigrationInput)=>{input.rollback.journalBackupSha256=""},"rollback"],
    ["staging candidate",(input:CityEndpointMigrationInput)=>{input.candidate.url="wss://replica-new-staging.bitcoinwalk.org/"},"production-name"],
  ])("fails closed for %s",(_,mutate,failedGate)=>{
    const input=acceptedInput();mutate(input);
    const report=assessCityEndpointMigration(input);
    expect(report.readyForSuccessorReview).toBe(false);
    expect(report.gates.find(gate=>gate.id===failedGate)?.status).toBe("failed");
  });

  it("rejects malformed, duplicate and empty event evidence",()=>{
    for(const ids of [[],["bad"],[eventIds[0],eventIds[0]],[eventIds[1],eventIds[0]]]){
      const input=acceptedInput();input.candidate.occurrenceIds=ids;
      expect(assessCityEndpointMigration(input).readyForSuccessorReview).toBe(false);
    }
  });
});
