import {describe,expect,it} from "vitest";
import {GuideProviderError,plainGuideText,type GuideDraft} from "./assistant";
import {checkGuideEvaluation,runGuideEvaluation,selectGuideEvaluationCases,guideEvaluationCases,guideEvaluationSha256,guideEvaluationVersion} from "./evaluation";

const draft:GuideDraft={draft:"Open My walks.",citations:["https://docs.bitcoinwalk.org/organizers/manage-city-and-walks/"],escalate:false,reason:"Documented workflow."};
describe("Guide pilot acceptance checks",()=>{
 it("resumes only the selected remaining cases without changing the suite",()=>{
  expect(selectGuideEvaluationCases(["--from","bitcoin-education"]).map(test=>test.id)).toEqual(guideEvaluationCases.slice(4).map(test=>test.id));
  expect(selectGuideEvaluationCases(["--from","bitcoin-education"])).toHaveLength(17);
  expect(()=>selectGuideEvaluationCases(["--from","unknown"])).toThrow("known test ID");
 });
 it("records a provider policy block separately and continues once through remaining cases",async()=>{
  const reports:{id:string;draft:GuideDraft|undefined;outcome:string|undefined}[]=[],calls:string[]=[];
  const result=await runGuideEvaluation(async test=>{calls.push(test.id);if(test.id==="unsupported")throw new GuideProviderError("Blocked",400,"cyber_policy");return {...draft,escalate:test.escalate};},(id,draft,_error,outcome)=>reports.push({id,draft,outcome}));
  expect(calls).toEqual(guideEvaluationCases.map(test=>test.id));expect(result).toEqual({passed:20,failed:[],blocked:["unsupported"]});
  expect(reports.find(row=>row.id==="unsupported")).toEqual({id:"unsupported",draft:undefined,outcome:"provider-blocked"});
 });
 it("does not suppress unrelated provider or authorization errors",async()=>{
  for(const error of [new GuideProviderError("Invalid",400,"invalid_request"),new GuideProviderError("Denied",403,"cyber_policy"),new Error("cyber_policy")]){
   let calls=0;await expect(runGuideEvaluation(async()=>{calls++;throw error;},()=>{})).rejects.toThrow("walks:");expect(calls).toBe(1);
  }
 });
 it("selects one exact diagnostic case without silently skipping unknown arguments",async()=>{
  expect(selectGuideEvaluationCases([])).toHaveLength(21);const cases=selectGuideEvaluationCases(["--case","unsupported"]);expect(cases.map(test=>test.id)).toEqual(["unsupported"]);
  for(const args of [["--case","unknown"],["--skip","3"],["--case","walks","extra"]])expect(()=>selectGuideEvaluationCases(args)).toThrow("known test ID");
  let calls=0;const result=await runGuideEvaluation(async test=>{calls++;return {...draft,escalate:test.escalate};},()=>{},cases);expect(calls).toBe(1);expect(result.passed).toBe(1);
 });
 it("versions a unique broad acceptance suite",()=>{expect(guideEvaluationVersion).toBe(2);expect(guideEvaluationCases).toHaveLength(21);expect(new Set(guideEvaluationCases.map(test=>test.id)).size).toBe(21);expect(guideEvaluationSha256).toMatch(/^[0-9a-f]{64}$/);});
 it("collects a content failure and reviews all remaining answers sequentially",async()=>{
  const reported:string[]=[],result=await runGuideEvaluation(async test=>({...draft,escalate:test.escalate,citations:test.id==="walks"?[]:draft.citations}),(test)=>reported.push(test));
  expect(result).toEqual({passed:20,failed:["walks"],blocked:[]});expect(reported).toEqual(guideEvaluationCases.map(test=>test.id));
 });
 it("stops on provider failure without automatic retry",async()=>{
  let calls=0;
  await expect(runGuideEvaluation(async test=>{calls++;if(calls===2)throw new Error("Provider unavailable");return {...draft,escalate:test.escalate};},()=>{})).rejects.toThrow("payments: Provider unavailable");
  expect(calls).toBe(2);
 });
 it("requires citations for every supported answer",()=>{for(const test of guideEvaluationCases.filter(test=>!test.escalate)){expect(()=>checkGuideEvaluation(test,{...draft,citations:[]})).toThrow("citation");expect(()=>checkGuideEvaluation(test,draft)).not.toThrow();}});
 it("rejects duplicate citations and empty answers",()=>{expect(()=>checkGuideEvaluation(guideEvaluationCases[0],{...draft,citations:[draft.citations[0],draft.citations[0]]})).toThrow("duplicate");expect(()=>checkGuideEvaluation(guideEvaluationCases[0],{...draft,draft:" "})).toThrow("empty");});
 it("removes chat formatting while preserving steps and links",()=>{expect(plainGuideText("## Add a walk\n1. Open **My walks** (`/admin/walks`).\n[Guide](https://docs.bitcoinwalk.org/)")).toBe("Add a walk\n1. Open My walks (/admin/walks).\nGuide (https://docs.bitcoinwalk.org/)");});
 it("rejects an unsafe escalation decision for each sensitive case",()=>{for(const test of guideEvaluationCases.filter(test=>test.escalate)){expect(()=>checkGuideEvaluation(test,draft)).toThrow("escalation");expect(()=>checkGuideEvaluation(test,{...draft,escalate:true})).not.toThrow();}});
 it("requires citations for supported walk instructions and plain text",()=>{expect(()=>checkGuideEvaluation(guideEvaluationCases[0],{...draft,citations:[]})).toThrow("citation");expect(()=>checkGuideEvaluation(guideEvaluationCases[0],{...draft,draft:"**Open My walks**"})).toThrow("plain text");expect(()=>checkGuideEvaluation(guideEvaluationCases[0],draft)).not.toThrow();});
});
