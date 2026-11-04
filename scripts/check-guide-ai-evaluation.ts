import {lstatSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {draftGuideReply,loadGuideKnowledge} from "../src/guide/assistant";
import {guideEvaluationCases,checkGuideEvaluation} from "../src/guide/evaluation";

async function main(){
 const credentials=process.env.CREDENTIALS_DIRECTORY,knowledgePath=process.env.GUIDE_KNOWLEDGE,model=process.env.GUIDE_AI_MODEL;
 if(!credentials||!knowledgePath||!model)throw new Error("Evaluation configuration is incomplete.");
 const path=join(credentials,"openai-key"),stat=lstatSync(path);if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>512)throw new Error("API credential must be private.");
 const apiKey=readFileSync(path,"utf8").trim();if(!apiKey)throw new Error("API credential is empty.");
 const knowledge=loadGuideKnowledge(knowledgePath);let passed=0;
 for(const test of guideEvaluationCases){
  const draft=await draftGuideReply([{id:test.id,sender:"f".repeat(64),content:test.content,createdAt:1,receivedAt:1}],knowledge,{apiKey,model});
  console.log(JSON.stringify({test:test.id,model,synthetic:true,...draft,sent:false}));checkGuideEvaluation(test,draft);passed++;
 }
 console.log(JSON.stringify({result:"BW152_EVALUATION_CHECKS_OK",model,knowledgeSha256:knowledge.sha256,passed,total:guideEvaluationCases.length,humanReviewRequired:true,synthetic:true,sent:false}));
}
main().catch(error=>{console.error(`Guide evaluation failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
