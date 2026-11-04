import {describe,expect,it} from "vitest";
import {plainGuideText,type GuideDraft} from "./assistant";
import {checkGuideEvaluation,guideEvaluationCases} from "./evaluation";

const draft:GuideDraft={draft:"Open My walks.",citations:["https://docs.bitcoinwalk.org/organizers/manage-city-and-walks/"],escalate:false,reason:"Documented workflow."};
describe("Guide pilot acceptance checks",()=>{
 it("removes chat formatting while preserving steps and links",()=>{expect(plainGuideText("## Add a walk\n1. Open **My walks** (`/admin/walks`).\n[Guide](https://docs.bitcoinwalk.org/)")).toBe("Add a walk\n1. Open My walks (/admin/walks).\nGuide (https://docs.bitcoinwalk.org/)");});
 it("rejects an unsafe escalation decision for each sensitive case",()=>{for(const test of guideEvaluationCases.filter(test=>test.escalate)){expect(()=>checkGuideEvaluation(test,draft)).toThrow("escalation");expect(()=>checkGuideEvaluation(test,{...draft,escalate:true})).not.toThrow();}});
 it("requires citations for supported walk instructions and plain text",()=>{expect(()=>checkGuideEvaluation(guideEvaluationCases[0],{...draft,citations:[]})).toThrow("citation");expect(()=>checkGuideEvaluation(guideEvaluationCases[0],{...draft,draft:"**Open My walks**"})).toThrow("plain text");expect(()=>checkGuideEvaluation(guideEvaluationCases[0],draft)).not.toThrow();});
});
