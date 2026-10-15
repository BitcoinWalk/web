"use client";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {cityAliases,type CityDocument} from "../../domain/city";
import { relayConfig } from "../../lib/relay-config";
import { createApprovalEvent, createAuthorizationEvent } from "../../nostr/city-event";
import { queryDirectoryRecords } from "../../nostr/city-records";
import { queryAuthorizations } from "../../nostr/city-records";
import { isSuperAdmin } from "../../nostr/authority";
import { publishVerifiedEvent } from "../../nostr/relay";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../nostr/signer";
import { matchesInitialCalendar } from "../../nostr/calendar-records";
import type { Event } from "nostr-tools";
import { queryCalendarEvents } from "../../nostr/city-records";
import { registrationSlug } from "../../domain/registration";
import {completeCityActivation,generateCityImage,importCityImageURL,type CityActivationResult} from "../../lib/media-client";
import {cityFieldChanges} from "../../domain/city-diff";
import {calendarDiscoverySummary,publishCalendarDiscoveryEvent} from "../../nostr/calendar-discovery";
import {paymentFetch,signPayment} from "../../components/city-payment";
import {paidPaymentForCity} from "../../payments/dashboard";
import type {PaymentView} from "../../payments/service";
import {announcePendingRequestCount} from "../../components/pending-request-count";
import {createSponsorshipRevision,latestSponsorships,querySponsorships,sponsorshipKey} from "../../nostr/sponsorships";
import CityFinder from "../../components/city-finder";
import {provisionWalkieTalkieCity} from "../../lib/walkie-talkie-provision-client";
import {adminCityRequests,FINAL_REJECTION_PREFIX,visibleDecisionNote,type AdminCityRequestStatus} from "../../domain/admin-city-requests";

type Submission = { eventId: string; initialEventIds: string[]; author: string; cityId: string; slug: string; cityName: string; startAt: string; meetingPoint: string; city: CityDocument; previous?: string; previousCity?:CityDocument; paid:boolean; registered:boolean; established:boolean; status:AdminCityRequestStatus; decisionNote?:string; decidedAt?:number };
type State = { message: string; tone: "info" | "error" | "success"; approvedWalk?: { href: string; name: string } };
type ImageState={status:"idle"|"waiting"|"working"|"ready"|"error";message:string};
type ActivationState=CityActivationResult["checks"];
const pendingActivation=(paid:boolean):ActivationState=>({
  logos:{status:"amber",message:"Generating after approval…"},
  og:{status:"amber",message:"Creating localized share image…"},
  meta:{status:"amber",message:"Validating title and description…"},
  payment:paid?{status:"green",message:"Pro payment is verified."}:{status:"na",message:"Basic city — Pro payment is not required."},
  paymentAuthorization:paid?{status:"amber",message:"Checking owner payout authorization…"}:{status:"na",message:"Basic city — payout authorization is not required."},
  nip05:paid?{status:"amber",message:"Checking managed NIP-05 provisioning…"}:{status:"na",message:"Basic city — managed NIP-05 is not included."},
  lnurl:paid?{status:"amber",message:"Checking managed Lightning address provisioning…"}:{status:"na",message:"Basic city — managed Lightning address is not included."},
  relay:paid?{status:"amber",message:"Checking paid-city relay provisioning…"}:{status:"na",message:"Basic city — dedicated relay not required."},
  walkieTalkie:{status:"amber",message:"Creating the city Walkie Talkie channel…"},
  community:paid?{status:"amber",message:"Checking the paid-city Armada community…"}:{status:"na",message:"Basic city — Armada is not included."},
});
const failedActivation=(message:string,paid:boolean):ActivationState=>({
  logos:{status:"red",message},og:{status:"red",message},meta:{status:"red",message},
  payment:paid?{status:"green",message:"Pro payment is verified."}:{status:"na",message:"Basic city — Pro payment is not required."},
  paymentAuthorization:paid?{status:"amber",message:"Payout authorization status was not confirmed."}:{status:"na",message:"Basic city — payout authorization is not required."},
  nip05:paid?{status:"amber",message:"NIP-05 status was not confirmed."}:{status:"na",message:"Basic city — managed NIP-05 is not included."},
  lnurl:paid?{status:"amber",message:"Lightning address status was not confirmed."}:{status:"na",message:"Basic city — managed Lightning address is not included."},
  relay:paid?{status:"amber",message:"Paid relay status was not confirmed."}:{status:"na",message:"Basic city — dedicated relay not required."},
  walkieTalkie:{status:"red",message},
  community:paid?{status:"amber",message:"Paid-city Armada status was not confirmed."}:{status:"na",message:"Basic city — Armada is not included."},
});
const activationLabels:Record<keyof ActivationState,string>={logos:"Logo pack",og:"OG image",meta:"Meta title and description",payment:"Pro payment",paymentAuthorization:"Payment authorization",nip05:"NIP-05",lnurl:"Lightning address (LNURL)",relay:"City relay",walkieTalkie:"Walkie Talkie",community:"Armada (Pro)"};
const initialActivation=(submission:Submission):ActivationState=>{
  const paid=submission.paid,pending=!paid&&submission.city.requestedTier==="paid";
  return {
    logos:{status:"amber",message:"Generated automatically after approval."},
    og:{status:"amber",message:"Created automatically from the city image and localized logo."},
    meta:{status:"amber",message:"Title and description validated automatically."},
    payment:paid?{status:"green",message:"Pro payment is verified."}:pending?{status:"amber",message:"Pro payment is still pending verification."}:{status:"na",message:"Basic city — Pro payment is not required."},
    paymentAuthorization:paid?{status:"amber",message:"Checked after approval; owner authorization remains a separate step."}:pending?{status:"amber",message:"Available after payment is verified."}:{status:"na",message:"Basic city — payout authorization is not required."},
    nip05:paid?{status:"amber",message:"Provisioning status is checked after approval."}:pending?{status:"amber",message:"Available after payment is verified."}:{status:"na",message:"Basic city — managed NIP-05 is not included."},
    lnurl:paid?{status:"amber",message:"Provisioning status is checked after approval."}:pending?{status:"amber",message:"Available after payment is verified."}:{status:"na",message:"Basic city — managed Lightning address is not included."},
    relay:paid?{status:"amber",message:"Paid relay provisioning will be checked after approval."}:pending?{status:"amber",message:"Dedicated relay waits for verified payment."}:{status:"na",message:"Basic city — dedicated relay not required."},
    walkieTalkie:{status:"amber",message:submission.registered?"The existing channel will be checked after approval.":"A city channel will be created automatically after approval."},
    community:paid?{status:"amber",message:"Armada group verification is completed separately after the city relay is active."}:pending?{status:"amber",message:"Armada waits for verified payment."}:{status:"na",message:"Basic city — Armada is not included."},
  };
};

function SubmittedFieldValue({value}:{value:string}){
  return /^https:\/\/[^\s]+$/.test(value)?<a href={value} target="_blank" rel="noreferrer">{value}</a>:<span>{value}</span>;
}

function SubmittedCityFields({submission}:{submission:Submission}){
  const changes=cityFieldChanges(submission.previousCity??null,submission.city);
  return <section aria-label={`Submitted changes for ${submission.cityName}`}>
    <h3>{submission.previous?"Changes":"Submitted city"}</h3>
    {submission.previous&&!submission.previousCity&&<p role="alert">The referenced previous revision could not be loaded, so a reliable field-by-field comparison is unavailable. Do not approve until the complete history loads.</p>}
    {submission.previous&&submission.previousCity&&changes.length===0&&<p>No city-document fields changed.</p>}
    {(!submission.previous||submission.previousCity)&&changes.length>0&&<ul>
      {changes.map(change=><li key={change.key}>
        <strong>{change.label}:</strong>{" "}
        {submission.previous?<><span>Previous: </span><SubmittedFieldValue value={change.before}/><span> → Submitted: </span><SubmittedFieldValue value={change.after}/></>:<SubmittedFieldValue value={change.after}/>}
      </li>)}
    </ul>}
  </section>;
}

export default function SubmissionApprovals() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [heroImages,setHeroImages]=useState<Record<string,string>>({});
  const [imageStates,setImageStates]=useState<Record<string,ImageState>>({});
  const [activationStates,setActivationStates]=useState<Record<string,ActivationState>>({});
  const [inviteSponsors,setInviteSponsors]=useState<Record<string,boolean>>({});
  const [slugs,setSlugs]=useState<Record<string,string>>({});
  const [aliases,setAliases]=useState<Record<string,string>>({});
  const [rejectionNotes,setRejectionNotes]=useState<Record<string,string>>({});
  const [selectedCity,setSelectedCity]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|AdminCityRequestStatus>("all");
  const [reviewing,setReviewing]=useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>({ message: "Connect the BitcoinWalk super-admin signer to load submissions.", tone: "info" });
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (/^submission-[0-9a-f]{64}$/.test(target)){const id=target.slice("submission-".length);if(submissions.some(row=>row.eventId===id))setReviewing(id);}
  }, [submissions]);
  useEffect(()=>{if(!reviewing)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setReviewing("");};window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};},[reviewing,busy]);

  const dashboard=useDashboard();
  useDashboardAutoLoad(loadSubmissions);
  async function loadSubmissions() {
    if(busy)return;
    if (relayConfig.readRelays.length === 0) {
      setState({ message: "Configure the BitcoinWalk relay to load submissions.", tone: "error" });
      return;
    }
    setBusy(true);setSubmissions([]);
    try {
      const pubkey = await getBrowserExtensionPubkey();
      if (!isSuperAdmin(pubkey)) throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");
      setState({ message: "Loading submissions…", tone: "info" });
      const [{revisions,approvals},grants,paymentsResult]=await Promise.all([
        queryDirectoryRecords(relayConfig.readRelays),
        queryAuthorizations(relayConfig.readRelays),
        signPayment({action:"list"},pubkey).then(paymentFetch).catch(()=>null),
      ]);
      const payments:PaymentView[]|null=paymentsResult?.payments??null;
      if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Reconnect.");
      const rows = adminCityRequests(revisions, approvals).filter(row=>!dashboard.selectedCity||row.revision.city.cityId===dashboard.selectedCity).map(({revision:{event,city},status,decision,established}) => {
        const previous=event.tags.find(tag=>tag[0]==="e" && tag[3]==="previous")?.[1];
        return ({
        eventId: event.id,
        initialEventIds: event.tags.filter(tag=>tag[0]==="e"&&tag[3]==="initial-walk").map(tag=>tag[1]),
        author: event.pubkey,
        cityId: city.cityId,
        slug: city.slug,
        cityName: city.cityName,
        startAt: city.startAt,
        meetingPoint: city.meetingPoint.description,
        city,
        previous,
        previousCity:previous?revisions.find(revision=>revision.event.id===previous)?.city:undefined,
        paid:!!payments&&!!paidPaymentForCity(payments,city.cityId),
        registered:grants.some(record=>record.grant.cityId===city.cityId),
        established,
        status,
        decisionNote:visibleDecisionNote(decision?.approval.note),
        decidedAt:decision?.event.created_at,
      });});
      setSubmissions(rows);
      setInviteSponsors(current=>Object.fromEntries(rows.filter(item=>!item.registered).map(item=>[item.eventId,current[item.eventId]??true])));
      setHeroImages(current=>Object.fromEntries(rows.map(item=>[item.eventId,current[item.eventId]??item.city.heroImageUrl??""])));
      setAliases(current=>Object.fromEntries(rows.map(item=>[item.eventId,current[item.eventId]??(item.city.aliases??[]).join(", ")])));
      const pendingCount=rows.filter(row=>row.status==="pending").length,waitingCount=rows.filter(row=>row.status==="pending"||row.status==="needs-changes").length;
      announcePendingRequestCount(pendingCount);
      setState({ message: `${waitingCount} waiting cities loaded · ${pendingCount} require a decision.${payments===null?" Payment status could not be verified, so paid markers are hidden.":""}`, tone: "info" });
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "Could not load submissions.", tone: "error" });
    } finally {setBusy(false);}
  }

  async function decide(submission: Submission, action: "accept" | "changes" | "reject") {
    if (busy) return;
    if (relayConfig.writeRelays.length === 0) {
      setState({ message: "Configure the BitcoinWalk relay before publishing a decision.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const pubkey = await getBrowserExtensionPubkey();
      if (!isSuperAdmin(pubkey)) throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");
      // A retained grant can exist after an interrupted approval. Until a city
      // has an approved revision it must still finish all new-city steps.
      if(submission.status!=="pending")throw new Error("This request already has a signed decision. Refresh before taking another action.");
      const status=action==="accept"?"approved" as const:"rejected" as const;
      const initialRequest=!submission.established;
      const rejectionNote=rejectionNotes[submission.eventId]?.trim()??"";
      if(status==="rejected"&&!rejectionNote)throw new Error("Add a clear reason so the host knows what to correct.");
      if(action==="reject"&&!window.confirm(`Reject the ${submission.registered?"revision":"application"} for ${submission.cityName}?\n\nThis is a final rejection, not a request for corrections. Signed history is retained.`))throw new Error("Rejection cancelled. No decision was signed.");
      let initialHero=heroImages[submission.eventId]?.trim();
      const approvedSlug=(slugs[submission.eventId]??(initialRequest?registrationSlug(submission.cityName):submission.slug)).trim();
      const approvedAliases=cityAliases(aliases[submission.eventId]??submission.city.aliases??[],submission.cityName);
      if(status==="approved"&&approvedAliases.length>20)throw new Error("Use no more than 20 alternative city names.");
      if(status==="approved"&&approvedAliases.some(alias=>alias.length>100))throw new Error("Each alternative city name must be 100 characters or fewer.");
      if(status==="approved"&&initialRequest&&!initialHero)throw new Error("Choose the initial landscape image before approving this city.");
      if(status==="approved"&&initialHero){try{new URL(initialHero);}catch{throw new Error("Enter a valid HTTPS image URL before approving.");}if(!initialHero.startsWith("https://"))throw new Error("The initial image must use HTTPS.");}
      if(status==="approved"&&initialHero&&!initialHero.includes("/api/media/files/")){setState({message:"Approve importing the landscape into protected BitcoinWalk storage…",tone:"info"});initialHero=(await importCityImageURL(submission.cityId,initialHero)).url;}
      if (status === "approved") {
        const existing = (await queryAuthorizations(relayConfig.readRelays)).find(r => r.grant.cityId === submission.cityId);
        if (!existing && !submission.initialEventIds.length) throw new Error("This new-city submission has no signed first walk. Reject it and ask the city host to submit again.");
        if (!existing) {
          setState({ message: "Step 1: sign creator registration. If a later step fails, registration remains; retrying approval will reuse it.", tone: "info" });
          const grant = await signWithBrowserExtension(createAuthorizationEvent({ cityId: submission.cityId, creatorPubkey: submission.author, creatorRevisionId: submission.eventId, editorPubkeys: [submission.author], superAdminPubkey: pubkey }));
          if (grant.pubkey !== pubkey) throw new Error("Signer identity changed; registration cancelled.");
          await publishVerifiedEvent(grant, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
        } else if (!existing.grant.editorPubkeys.includes(submission.author) && !isSuperAdmin(submission.author)) {
          throw new Error("This author is not authorized for this city. Existing editors were not changed.");
        }
      }
      let sponsorMessage="";
      if(status==="approved"&&initialRequest){
        const invite=inviteSponsors[submission.eventId]??true;
        const key=`city:${submission.cityId}`,existing=latestSponsorships(await querySponsorships(relayConfig.readRelays)).find(row=>sponsorshipKey(row.sponsorship.scope)===key);
        const desired=invite?"empty" as const:"hidden" as const,change=!existing&&invite||!!existing&&["empty","hidden"].includes(existing.sponsorship.mode)&&existing.sponsorship.mode!==desired;
        if(change){
          setState({message:invite?"Step 2: sign the default sponsor invitation. This creates the ‘Sponsor this BitcoinWalk’ module after approval.":"Step 2: sign removal of the previously prepared sponsor invitation.",tone:"info"});
          const invitation=await signWithBrowserExtension(createSponsorshipRevision({version:1,scope:{type:"city",cityId:submission.cityId},mode:desired,...(existing?{previousRevisionId:existing.event.id}:{})}));
          if(invitation.pubkey!==pubkey)throw new Error("Signer identity changed; sponsor invitation cancelled.");
          await publishVerifiedEvent(invitation,relayConfig.writeRelays,1,authenticateWithBrowserExtension);sponsorMessage=invite?" Sponsor invitation enabled.":" Sponsor invitation disabled.";
        }else if(existing)sponsorMessage=` Existing ${existing.sponsorship.mode} sponsorship setting preserved.`;
      }
      setState({ message: "Final step: sign the city decision…", tone: "info" });
      const signed = await signWithBrowserExtension(createApprovalEvent({
        cityId: submission.cityId,
        cityRevisionId: submission.eventId,
        ...(submission.initialEventIds.length===1?{initialEventId:submission.initialEventIds[0]}:submission.initialEventIds.length?{initialEventIds:submission.initialEventIds}:{}),
        ...(initialHero?{heroImageUrl:initialHero}:{}),
        ...(status==="approved"?{slug:approvedSlug,aliases:approvedAliases}:{}),
        ...(status==="rejected"?{note:action==="reject"?FINAL_REJECTION_PREFIX+rejectionNote:rejectionNote}:{}),
        status,
      }));
      if (signed.pubkey !== pubkey) throw new Error("Signer identity changed; decision cancelled.");
      const publication = await publishVerifiedEvent(signed, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
      let discoveryMessage="";
      if (status === "approved" && submission.initialEventIds.length) {
        const events = await queryCalendarEvents(relayConfig.readRelays, { ids: submission.initialEventIds });
        const approval=submission.initialEventIds.length===1?{cityId:submission.cityId,cityRevisionId:submission.eventId,initialEventId:submission.initialEventIds[0],status:"approved" as const}:{cityId:submission.cityId,cityRevisionId:submission.eventId,initialEventIds:submission.initialEventIds,status:"approved" as const};
        const walk = { revision: { event: { id: submission.eventId, pubkey: submission.author } as Event, city: submission.city }, approval: { event: signed, approval } };
        const released=submission.initialEventIds.map(id=>events.find(event=>event.id===id)).filter((event):event is Event=>!!event&&matchesInitialCalendar(event,walk));
        if(released.length!==submission.initialEventIds.length)throw new Error("City approval was saved, but the signed walk series could not be verified. Do not approve again; retry the read and investigate publication.");
        const results=await Promise.all(released.map(event=>publishCalendarDiscoveryEvent(event,relayConfig.calendarDiscoveryRelays)));
        discoveryMessage=` ${released.length} walk${released.length===1?"":"s"} released. ${calendarDiscoverySummary(results[0],relayConfig.calendarDiscoveryRelays.length)}`;
      }
      if(status==="approved"){
        let activation=pendingActivation(submission.paid);setActivationStates(current=>({...current,[submission.eventId]:activation}));
        try{activation=(await completeCityActivation(signed)).checks;setActivationStates(current=>({...current,[submission.eventId]:activation}));}
        catch(error){const message=error instanceof Error?error.message:"Activation status could not be checked.";activation=failedActivation(message,submission.paid);setActivationStates(current=>({...current,[submission.eventId]:activation}));}
        if(initialRequest){
          setState({message:`Approved. Creating BitcoinWalk ${submission.cityName} Walkie Talkie and verifying its founding members…`,tone:"info"});
          try{
            const walkieTalkie=await provisionWalkieTalkieCity(submission.cityId,pubkey);
            try{activation=(await completeCityActivation(signed)).checks;}
            catch{activation={...activation,walkieTalkie:{status:"green",message:`City Walkie Talkie is active as ${walkieTalkie.groupId}.`,url:`https://chat.bitcoinwalk.org/${encodeURIComponent(walkieTalkie.slug)}`}};}
            setActivationStates(current=>({...current,[submission.eventId]:activation}));
          }catch(error){const message=error instanceof Error?error.message:"Walkie Talkie provisioning stopped.";activation={...activation,walkieTalkie:{status:"red",message:`${message} The approval remains valid; retry under Monitoring → Communities.`}};setActivationStates(current=>({...current,[submission.eventId]:activation}));}
        }
      }
      const nextStatus:AdminCityRequestStatus=status==="approved"?"accepted":action==="reject"?"rejected":"needs-changes";
      setSubmissions(items=>{const next=items.map(item=>item.eventId===submission.eventId?{...item,status:nextStatus,decisionNote:rejectionNote,decidedAt:signed.created_at}:item);announcePendingRequestCount(next.filter(item=>item.status==="pending").length);return next;});
      setState({
        message: `${action === "accept" ? "Accepted" : action==="changes"?"Changes requested":"Rejected"} on ${publication.accepted.length} BitcoinWalk relay(s).${sponsorMessage}${discoveryMessage}`,
        tone: "success",
        ...(status === "approved" ? { approvedWalk: { href: `/${encodeURIComponent(approvedSlug)}`, name: submission.cityName } } : {}),
      });
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "Could not publish the decision.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function generateLandscape(submission:Submission){
    if(busy)return;setBusy(true);
    setImageStates(current=>({...current,[submission.eventId]:{status:"waiting",message:"Waiting for your signer. Approve the landscape-generation request…"}}));
    try{const pubkey=await getBrowserExtensionPubkey();if(!isSuperAdmin(pubkey))throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");setImageStates(current=>({...current,[submission.eventId]:{status:"working",message:"Generating and securing the landscape in BitcoinWalk storage. This can take about a minute…"}}));const result=await generateCityImage(submission.cityId,submission.eventId);setHeroImages(images=>({...images,[submission.eventId]:result.url}));setImageStates(current=>({...current,[submission.eventId]:{status:"ready",message:`Generated with ${result.model}. Review this selected image before approving the city.`}}));}catch(error){setImageStates(current=>({...current,[submission.eventId]:{status:"error",message:error instanceof Error?error.message:"Could not generate the landscape."}}));}finally{setBusy(false);}
  }

  async function importLandscape(submission:Submission){const source=heroImages[submission.eventId]?.trim();if(!source||source.includes("/api/media/files/"))return;if(busy)return;setBusy(true);setImageStates(current=>({...current,[submission.eventId]:{status:"waiting",message:"Waiting for your signer. Approve importing this image…"}}));try{const result=await importCityImageURL(submission.cityId,source);setHeroImages(images=>({...images,[submission.eventId]:result.url}));setImageStates(current=>({...current,[submission.eventId]:{status:"ready",message:"The image is secured in BitcoinWalk storage and selected for this city."}}));}catch(error){setImageStates(current=>({...current,[submission.eventId]:{status:"error",message:error instanceof Error?error.message:"Could not import the landscape."}}));}finally{setBusy(false);}}

  const queueSubmissions=useMemo(()=>submissions.filter(submission=>submission.status==="pending"||submission.status==="needs-changes"),[submissions]);
  const requestCities=[...new Map(queueSubmissions.map(submission=>[submission.cityId,{id:submission.cityId,name:submission.cityName,meta:submission.paid?"Pro — paid":submission.city.requestedTier==="paid"?"Pro — payment pending":"Basic",keywords:[submission.slug,submission.cityId,submission.author,...(submission.city.aliases??[])]}])).values()];
  const filteredSubmissions=useMemo(()=>queueSubmissions.filter(submission=>(!selectedCity||submission.cityId===selectedCity)&&(statusFilter==="all"||submission.status===statusFilter)),[queueSubmissions,selectedCity,statusFilter]);
  const selectedSubmission=queueSubmissions.find(submission=>submission.eventId===reviewing);
  const statusLabels:Record<AdminCityRequestStatus,string>={pending:"Action required",accepted:"Accepted","needs-changes":"Awaits change",rejected:"Rejected",archived:"Archived"};
  const filters:Array<{key:"all"|AdminCityRequestStatus;label:string}>=[{key:"all",label:"All waiting"},{key:"pending",label:"Action required"},{key:"needs-changes",label:"Awaits change"}];

  const requestRow=(submission:Submission)=><button className="request-review-row" type="button" key={submission.eventId} id={`submission-${submission.eventId}`} onClick={()=>setReviewing(submission.eventId)}>
    <span className="request-review-row__identity"><strong>{submission.paid&&<span aria-label="Verified Pro city" title="Verified Pro city">⚡ </span>}{submission.cityName}</strong><small>{submission.registered?"City revision":submission.previous?"Corrected application":"New city"} · /{submission.slug}</small></span>
    <span className={`request-status request-status--${submission.status}`}>{statusLabels[submission.status]}</span>
    <span className="request-review-row__date">{submission.decidedAt?`Decided ${new Date(submission.decidedAt*1000).toLocaleDateString()}`:`Submitted ${new Date(submission.startAt).toLocaleDateString()}`}</span>
    <span className="request-review-row__open">{submission.status==="pending"?"Review":"View"}<span aria-hidden="true"> →</span></span>
  </button>;

  return <section className="request-review">
    <div className="request-review__heading"><div><h2>City request queue</h2><p>Only waiting work appears here. Action required belongs to the super-admin; Awaits change belongs to a host or external provider. Use Cities for the complete inventory.</p></div><button disabled={busy} type="button" onClick={loadSubmissions}>{busy?"Refreshing…":"Refresh"}</button></div>
    <p className={`request-review__notice request-review__notice--${state.tone}`} role={state.tone==="error"?"alert":"status"} aria-live="polite">{state.message}{state.approvedWalk&&<> <Link prefetch={false} href={state.approvedWalk.href}>View BitcoinWalk {state.approvedWalk.name} →</Link></>}</p>
    <div className="request-review__filters">
      <CityFinder disabled={busy||!queueSubmissions.length} label="Find a city" placeholder="Search waiting city requests…" value={selectedCity} onChange={setSelectedCity} items={requestCities}/>
      <div className="request-status-filters" aria-label="Filter requests by status">{filters.map(filter=><button key={filter.key} type="button" aria-pressed={statusFilter===filter.key} onClick={()=>setStatusFilter(filter.key)}>{filter.label}<span>{filter.key==="all"?queueSubmissions.length:queueSubmissions.filter(row=>row.status===filter.key).length}</span></button>)}</div>
    </div>
    <p className="request-review__count">Showing {filteredSubmissions.length} of {queueSubmissions.length} waiting cities</p>
    <div className="request-review-list" aria-label="Waiting city requests">{filteredSubmissions.map(requestRow)}{!filteredSubmissions.length&&<p className="request-review__empty">No waiting cities match these filters.</p>}</div>
    {selectedSubmission&&<div className="request-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setReviewing("");}}>
      <section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
        <header className="request-modal__header"><div><span className={`request-status request-status--${selectedSubmission.status}`}>{statusLabels[selectedSubmission.status]}</span><h2 id="request-modal-title">{selectedSubmission.cityName}</h2><p>{selectedSubmission.registered?"City revision":selectedSubmission.previous?"Corrected city application":"New city application"} · {selectedSubmission.paid?"Pro — paid":selectedSubmission.city.requestedTier==="paid"?"Pro — payment pending":"Basic"}</p></div><button className="request-modal__close" type="button" disabled={busy} onClick={()=>setReviewing("")} aria-label="Close city review">×</button></header>
        <div className="request-modal__body">
          <section className="request-modal__summary"><div><span>First walk</span><strong>{new Date(selectedSubmission.startAt).toLocaleString()}</strong></div><div><span>Meeting point</span><strong>{selectedSubmission.meetingPoint}</strong></div><div><span>Signed walks</span><strong>{selectedSubmission.initialEventIds.length||"Missing"}</strong></div><div><span>Host</span><code title={selectedSubmission.author}>{selectedSubmission.author.slice(0,12)}…{selectedSubmission.author.slice(-8)}</code></div></section>
          <section className="request-modal__panel"><h3>Submitted city profile</h3><p>{selectedSubmission.city.description}</p><SubmittedCityFields submission={selectedSubmission}/><dl className="request-modal__metadata"><div><dt>City ID</dt><dd><code>{selectedSubmission.cityId}</code></dd></div><div><dt>Revision</dt><dd><code>{selectedSubmission.eventId}</code></dd></div>{selectedSubmission.previous&&<div><dt>Based on</dt><dd><code>{selectedSubmission.previous}</code></dd></div>}</dl></section>
          <section className="request-modal__panel request-modal__settings"><h3>Public settings</h3><label>Public URL <span className="request-url-field"><span>bitcoinwalk.org/</span><input required minLength={2} maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" disabled={selectedSubmission.status!=="pending"} value={slugs[selectedSubmission.eventId]??(selectedSubmission.registered?selectedSubmission.slug:registrationSlug(selectedSubmission.cityName))} onChange={event=>setSlugs(current=>({...current,[selectedSubmission.eventId]:event.target.value.toLowerCase()}))}/></span></label><label>Alternative city names <input maxLength={2020} disabled={selectedSubmission.status!=="pending"} value={aliases[selectedSubmission.eventId]??(selectedSubmission.city.aliases??[]).join(", ")} onChange={event=>setAliases(current=>({...current,[selectedSubmission.eventId]:event.target.value}))} placeholder="One or more names, separated by commas"/></label></section>
          {!selectedSubmission.registered&&<section className="request-modal__panel"><h3>City image</h3><label>Landscape image URL <input type="url" disabled={selectedSubmission.status!=="pending"} placeholder="https://…" value={heroImages[selectedSubmission.eventId]??""} onChange={event=>{setHeroImages(images=>({...images,[selectedSubmission.eventId]:event.target.value}));setImageStates(current=>({...current,[selectedSubmission.eventId]:{status:"idle",message:"The image will be validated and stored during approval."}}));}}/></label>{selectedSubmission.status==="pending"&&<div className="request-modal__image-actions"><button disabled={busy} type="button" onClick={()=>generateLandscape(selectedSubmission)}>{imageStates[selectedSubmission.eventId]?.status==="waiting"||imageStates[selectedSubmission.eventId]?.status==="working"?"Generating…":"Generate image"}</button><button disabled={busy||!heroImages[selectedSubmission.eventId]?.trim()||heroImages[selectedSubmission.eventId]?.includes("/api/media/files/")} type="button" onClick={()=>importLandscape(selectedSubmission)}>Store image now</button></div>}{imageStates[selectedSubmission.eventId]?.message&&<p role={imageStates[selectedSubmission.eventId]?.status==="error"?"alert":"status"}>{imageStates[selectedSubmission.eventId].message}</p>}{heroImages[selectedSubmission.eventId]&&<Image unoptimized className="request-modal__hero" src={heroImages[selectedSubmission.eventId]} width={1200} height={630} alt={`Selected landscape for ${selectedSubmission.cityName}`}/>}<label className="inline-checkbox"><input type="checkbox" checked={inviteSponsors[selectedSubmission.eventId]??true} disabled={busy||selectedSubmission.status!=="pending"} onChange={event=>setInviteSponsors(current=>({...current,[selectedSubmission.eventId]:event.target.checked}))}/> Show sponsor invitation</label></section>}
          {selectedSubmission.status!=="pending"&&<section className="request-modal__decision"><h3>{statusLabels[selectedSubmission.status]}</h3><p>{selectedSubmission.decisionNote||(selectedSubmission.status==="accepted"?"This city request was accepted.":"No reviewer note was provided.")}</p>{selectedSubmission.decidedAt&&<small>Signed {new Date(selectedSubmission.decidedAt*1000).toLocaleString()}</small>}</section>}
          {(selectedSubmission.status==="accepted"||activationStates[selectedSubmission.eventId])&&<section className="request-modal__panel"><h3>Activation checklist</h3><ul className="request-activation-list" aria-label={`Activation checklist for ${selectedSubmission.cityName}`}>{(Object.entries(activationStates[selectedSubmission.eventId]??initialActivation(selectedSubmission)) as Array<[keyof ActivationState,ActivationState[keyof ActivationState]]>).map(([key,check])=><li key={key}><span aria-hidden="true">{check.status==="green"?"🟢":check.status==="red"?"🔴":check.status==="na"?"⚪":"🟠"}</span><span><strong>{activationLabels[key]}</strong><small>{check.message}{check.url&&<> <a href={check.url} target="_blank" rel="noreferrer">Preview</a></>}</small></span></li>)}</ul></section>}
        </div>
        {selectedSubmission.status==="pending"&&<footer className="request-modal__footer"><label>Reviewer note <textarea maxLength={500} value={rejectionNotes[selectedSubmission.eventId]??""} onChange={event=>setRejectionNotes(current=>({...current,[selectedSubmission.eventId]:event.target.value}))} placeholder="Required when asking for changes or rejecting."/></label><div className="request-decision-actions"><button className="request-action request-action--reject" disabled={busy} type="button" onClick={()=>decide(selectedSubmission,"reject")}>Reject</button><button className="request-action request-action--changes" disabled={busy} type="button" onClick={()=>decide(selectedSubmission,"changes")}>Need changes</button><button className="request-action request-action--accept" disabled={busy||!!selectedSubmission.previous&&!selectedSubmission.previousCity||!selectedSubmission.registered&&(!selectedSubmission.initialEventIds.length||!heroImages[selectedSubmission.eventId]?.trim())} type="button" onClick={()=>decide(selectedSubmission,"accept")}>{busy?"Working…":"Accept"}</button></div><small>Need changes lets the host correct and resubmit. Reject is a final decision for this application.</small></footer>}
      </section>
    </div>}
  </section>;
}
