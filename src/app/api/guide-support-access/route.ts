import type {Event} from "nostr-tools";
import {parseMediaRequest} from "../../../domain/media-request";
import {isGuideRequester} from "../../../server/replication-status-auth";
import {guideSupportPlan} from "../../../server/guide-support-access";

export const dynamic="force-dynamic",runtime="nodejs";
export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event};
  const command=body.event?parseMediaRequest(body.event):null;
  const stagingTest=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN==="https://app-staging.bitcoinwalk.org"&&/^[0-9a-f]{64}$/.test(process.env.BITCOINWALK_GUIDE_POLICY_TEST_PUBKEY??"")&&body.event?.pubkey===process.env.BITCOINWALK_GUIDE_POLICY_TEST_PUBKEY;
  if(!body.event||command?.action!=="guide-support-access"||(!stagingTest&&!isGuideRequester(body.event,"guide-support-access")))return Response.json({error:"Guide authorization required."},{status:403});
  return Response.json({version:1,plan:await guideSupportPlan(command.recipientPubkey)},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Guide plan verification unavailable."},{status:503});}
}
