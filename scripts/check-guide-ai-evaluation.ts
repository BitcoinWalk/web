import {lstatSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {draftGuideReply,loadGuideKnowledge,guidePromptSha256} from "../src/guide/assistant";
import {guideEvaluationCases,selectGuideEvaluationCases,runGuideEvaluation,guideEvaluationVersion,guideEvaluationSha256} from "../src/guide/evaluation";

async function main(){
 const cases=selectGuideEvaluationCases(process.argv.slice(2)),completeSuite=cases.length===guideEvaluationCases.length;
 const credentials=process.env.CREDENTIALS_DIRECTORY,knowledgePath=process.env.GUIDE_KNOWLEDGE,model=process.env.GUIDE_AI_MODEL;
 if(!credentials||!knowledgePath||!model)throw new Error("Evaluation configuration is incomplete.");
 const path=join(credentials,"openai-key"),stat=lstatSync(path);if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>512)throw new Error("API credential must be private.");
 const apiKey=readFileSync(path,"utf8").trim();if(!apiKey)throw new Error("API credential is empty.");
 const knowledge=loadGuideKnowledge(knowledgePath);
 console.log(JSON.stringify({result:"BW152_EVALUATION_STARTED",model,promptSha256:guidePromptSha256,suiteVersion:guideEvaluationVersion,suiteSha256:guideEvaluationSha256,knowledgeSha256:knowledge.sha256,total:cases.length,completeSuite,selectedCases:cases.map(test=>test.id),synthetic:true,sent:false}));
 const {passed,failed,blocked}=await runGuideEvaluation(
  test=>draftGuideReply([{id:test.id,sender:"f".repeat(64),content:test.content,createdAt:1,receivedAt:1}],knowledge,{apiKey,model}),
  (test,draft,error,outcome)=>console.log(JSON.stringify({test,model,synthetic:true,...draft,checkPassed:!error,...(error?{error}:{}),...(outcome?{outcome}:{}),sent:false})),
  cases,
 );
 console.log(JSON.stringify({result:failed.length?"BW152_EVALUATION_CHECKS_FAILED":blocked.length?"BW152_EVALUATION_INCOMPLETE":"BW152_EVALUATION_CHECKS_OK",model,promptSha256:guidePromptSha256,suiteVersion:guideEvaluationVersion,suiteSha256:guideEvaluationSha256,knowledgeSha256:knowledge.sha256,passed,failed,blocked,total:cases.length,completeSuite,humanReviewRequired:true,automaticSendingApproved:false,synthetic:true,sent:false}));
 if(failed.length||blocked.length)process.exitCode=1;
}
main().catch(error=>{console.error(`Guide evaluation failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
