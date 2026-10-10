import type {Event} from "nostr-tools";
import {parseApprovalRecord,queryCalendarEvents,queryDirectoryRecords} from "../../../../nostr/city-records";
import {calendarOccurrence} from "../../../../nostr/calendar-records";
import {managedCities} from "../../../../nostr/moderation";
import {serverReadRelays} from "../../../../lib/server-relay-config";
import {getLogoCatalog,getLogoRuntime} from "../../../../logos/runtime";
import {managedBackground,ensureShareImage} from "../../../../server/share-image";
import {shareOrigin} from "../../../../server/share-preview";
import {cityPreview,walkPreview} from "../../../../domain/share-preview";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {directoryConfig} from "../../../../lib/directory-config";
import {shareBackgroundPosition} from "../../../../domain/hero-presentation";
import {cityProvisioningCapabilities,type CapabilityState} from "../../../../rustress/provisioning-capabilities";

export const dynamic="force-dynamic",runtime="nodejs";
type Check={status:"green"|"amber"|"red"|"na";message:string;url?:string};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const capability=(state:CapabilityState,active:string,waiting:string):Check=>state==="active"?{status:"green",message:active}:
 state==="needs-attention"?{status:"red",message:"Needs administrator attention before activation can continue."}:
 {status:"amber",message:waiting};

export async function POST(request:Request){
 try{
  const body=await request.json() as {event?:Event},approval=body.event&&parseApprovalRecord(body.event);
  if(!body.event||!approval||approval.approval.status!=="approved")return reply({error:"A valid signed city approval is required."},403);
  const snapshot=await queryDirectoryRecords(serverReadRelays()),managed=managedCities(snapshot.revisions,snapshot.approvals).find(row=>row.state==="approved"&&row.decision.event.id===body.event!.id&&row.revision.event.id===approval.approval.cityRevisionId);
  if(!managed)return reply({error:"The exact approved city could not be read back yet. Retry status shortly; do not approve again."},409);
  await getLogoRuntime().service.tick();
  const city=managed.revision.city,slug=approval.approval.slug??city.slug,catalog=getLogoCatalog(),pack=await catalog.ready({cityId:city.cityId,revisionId:managed.revision.event.id,slug});
  const logos:Check=pack?{status:"green",message:`${pack.manifest.files.length} localized logo files ready.`}:{status:"amber",message:"Logo generation is queued; the worker will retry automatically."};
  let og:Check={status:"amber",message:"Waiting for the localized logo pack."};
  if(pack){
   const images=[approval.approval.heroImageUrl,city.heroImageUrl],mark=await catalog.file(pack.jobKey,`${pack.slug}-bitcoinwalk-on-black.png`),background=await managedBackground(images);
   if(mark&&background){const hash=await ensureShareImage(background,null,mark.data,shareBackgroundPosition(images));og={status:"green",message:"1200 × 630 localized share image saved.",url:`${shareOrigin()}/api/og/files/${hash}.jpg`};}
   else og={status:"red",message:!mark?"Localized OG logo is missing.":"Approved city hero image is unavailable."};
  }
  const cityCopy=cityPreview(city.cityName);let meta:Check={status:"green",message:`City title ${Array.from(cityCopy.title).length}/65 · description ${Array.from(cityCopy.description).length}/160.`};
  const initialId=approval.approval.initialEventId??approval.approval.initialEventIds?.[0];
  if(initialId){const first=(await queryCalendarEvents(serverReadRelays(),{ids:[initialId]})).find(event=>event.id===initialId),occurrence=first&&calendarOccurrence(first);if(!occurrence)meta={status:"red",message:"The first walk metadata could not be verified."};else{const walkCopy=walkPreview({city:city.cityName,...occurrence,meetingPoint:occurrence.meetingPoint.description});meta={status:"green",message:`City and first-walk metadata ready · walk title ${Array.from(walkCopy.title).length}/80 · description ${Array.from(walkCopy.description).length}/160.`};}}
  const paymentRuntime=getPaymentRuntime(),entitled=paymentRuntime.store.entitled(city.cityId),configured=directoryConfig.paidCities[city.cityId];
  const payment:Check=entitled?{status:"green",message:"Pro payment is settled and the durable city entitlement is active."}:
   city.requestedTier==="paid"?{status:"amber",message:"Pro was requested; activation waits for verified payment."}:{status:"na",message:"Basic city — Pro payment is not required."};
  const setup=entitled?paymentRuntime.store.db.prepare("SELECT payoutVersion FROM pro_setup_task WHERE cityId=?").get(city.cityId) as {payoutVersion:number|null}|undefined:undefined;
  const paymentAuthorization:Check=!entitled?{status:"na",message:city.requestedTier==="paid"?"Available after the Pro payment is verified.":"Basic city — payout authorization is not required."}:
   setup?.payoutVersion?{status:"green",message:`Owner-authorized payout destination version ${setup.payoutVersion} is saved privately.`}:{status:"amber",message:"The city owner still needs to authorize a payout destination in Pro setup."};
  const capabilities=entitled?cityProvisioningCapabilities(paymentRuntime.store.db,city.cityId):null;
  const nip05:Check=!entitled?{status:"na",message:city.requestedTier==="paid"?"Available after the Pro payment is verified.":"Basic city — managed NIP-05 is not included."}:
   capability(capabilities!.nip05,`${slug}@bitcoinwalk.org passed independent NIP-05 verification.`,`Status: ${capabilities!.nip05}. ${capabilities!.detail}`);
  const lnurl:Check=!entitled?{status:"na",message:city.requestedTier==="paid"?"Available after the Pro payment is verified.":"Basic city — managed Lightning address is not included."}:
   capability(capabilities!.lightning,`${slug}@bitcoinwalk.org passed independent LNURL-pay verification.`,`Status: ${capabilities!.lightning}. ${capabilities!.detail}`);
  const relay:Check=!entitled?{status:"na",message:"Basic city — dedicated relay not required."}:configured?.subdomainReady?{status:"green",message:`${slug}.bitcoinwalk.org relay is provisioned.`}:{status:"amber",message:`Paid city — ${slug}.bitcoinwalk.org provisioning is not automated yet (BW-20).`};
  return reply({cityId:city.cityId,revisionId:managed.revision.event.id,checks:{logos,og,meta,payment,paymentAuthorization,nip05,lnurl,relay}});
 }catch{return reply({error:"City activation checks could not complete. Retry status; do not approve again."},500);}
}
