"use client";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";

import { useEffect, useState } from "react";
import Link from "next/link";
import {cityAliases,type CityDocument} from "../../domain/city";
import { relayConfig } from "../../lib/relay-config";
import { createApprovalEvent, createAuthorizationEvent } from "../../nostr/city-event";
import { pendingCityRevisions, queryDirectoryRecords } from "../../nostr/city-records";
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

type Submission = { eventId: string; initialEventIds: string[]; author: string; cityId: string; slug: string; cityName: string; startAt: string; meetingPoint: string; city: CityDocument; previous?: string; previousCity?:CityDocument; paid:boolean };
type State = { message: string; tone: "info" | "error" | "success"; approvedWalk?: { href: string; name: string } };
type ImageState={status:"idle"|"waiting"|"working"|"ready"|"error";message:string};
type ActivationState=CityActivationResult["checks"];
const pendingActivation=(paid:boolean):ActivationState=>({
  logos:{status:"amber",message:"Generating after approval…"},
  og:{status:"amber",message:"Creating localized share image…"},
  meta:{status:"amber",message:"Validating title and description…"},
  relay:paid?{status:"amber",message:"Checking paid-city relay provisioning…"}:{status:"na",message:"Basic city — dedicated relay not required."},
});
const failedActivation=(message:string,paid:boolean):ActivationState=>({
  logos:{status:"red",message},og:{status:"red",message},meta:{status:"red",message},
  relay:paid?{status:"amber",message:"Paid relay status was not confirmed."}:{status:"na",message:"Basic city — dedicated relay not required."},
});

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
  const [decided,setDecided]=useState<Record<string,boolean>>({});
  const [inviteSponsors,setInviteSponsors]=useState<Record<string,boolean>>({});
  const [slugs,setSlugs]=useState<Record<string,string>>({});
  const [aliases,setAliases]=useState<Record<string,string>>({});
  const [selectedCity,setSelectedCity]=useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>({ message: "Connect the BitcoinWalk super-admin signer to load submissions.", tone: "info" });
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (/^submission-[0-9a-f]{64}$/.test(target)) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [submissions]);

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
      const [{revisions,approvals},paymentsResult]=await Promise.all([
        queryDirectoryRecords(relayConfig.readRelays),
        signPayment({action:"list"},pubkey).then(paymentFetch).catch(()=>null),
      ]);
      const payments:PaymentView[]|null=paymentsResult?.payments??null;
      if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Reconnect.");
      const pending = pendingCityRevisions(revisions, approvals).filter(r=>!dashboard.selectedCity||r.city.cityId===dashboard.selectedCity).map(({ event, city }) => {
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
      });});
      setSubmissions(pending);
      setInviteSponsors(current=>Object.fromEntries(pending.filter(item=>!item.previous).map(item=>[item.eventId,current[item.eventId]??true])));
      setHeroImages(current=>Object.fromEntries(pending.map(item=>[item.eventId,current[item.eventId]??item.city.heroImageUrl??""])));
      setAliases(current=>Object.fromEntries(pending.map(item=>[item.eventId,current[item.eventId]??(item.city.aliases??[]).join(", ")])));
      announcePendingRequestCount(pending.length);
      setState({ message: `${pending.length} pending request(s).${payments===null?" Payment status could not be verified, so paid markers are hidden.":""}`, tone: "info" });
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "Could not load submissions.", tone: "error" });
    } finally {setBusy(false);}
  }

  async function decide(submission: Submission, status: "approved" | "rejected") {
    if (busy) return;
    if (relayConfig.writeRelays.length === 0) {
      setState({ message: "Configure the BitcoinWalk relay before publishing a decision.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const pubkey = await getBrowserExtensionPubkey();
      if (!isSuperAdmin(pubkey)) throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");
      let initialHero=heroImages[submission.eventId]?.trim();
      const approvedSlug=(slugs[submission.eventId]??(submission.previous?submission.slug:registrationSlug(submission.cityName))).trim();
      const approvedAliases=cityAliases(aliases[submission.eventId]??submission.city.aliases??[],submission.cityName);
      if(approvedAliases.length>20)throw new Error("Use no more than 20 alternative city names.");
      if(approvedAliases.some(alias=>alias.length>100))throw new Error("Each alternative city name must be 100 characters or fewer.");
      if(status==="approved"&&!submission.previous&&!initialHero)throw new Error("Choose the initial landscape image before approving this city.");
      if(initialHero){try{new URL(initialHero);}catch{throw new Error("Enter a valid HTTPS image URL before approving.");}if(!initialHero.startsWith("https://"))throw new Error("The initial image must use HTTPS.");}
      if(status==="approved"&&initialHero&&!initialHero.includes("/api/media/files/")){setState({message:"Approve importing the landscape into protected BitcoinWalk storage…",tone:"info"});initialHero=(await importCityImageURL(submission.cityId,initialHero)).url;}
      if (status === "approved") {
        const existing = (await queryAuthorizations(relayConfig.readRelays)).find(r => r.grant.cityId === submission.cityId);
        if (!existing && !submission.initialEventIds.length) throw new Error("This new-city submission has no signed first walk. Reject it and ask the organizer to submit again.");
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
      if(status==="approved"&&!submission.previous){
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
        setDecided(current=>({...current,[submission.eventId]:true}));
        setActivationStates(current=>({...current,[submission.eventId]:pendingActivation(submission.paid)}));
        try{const activation=await completeCityActivation(signed);setActivationStates(current=>({...current,[submission.eventId]:activation.checks}));}
        catch(error){const message=error instanceof Error?error.message:"Activation status could not be checked.";setActivationStates(current=>({...current,[submission.eventId]:failedActivation(message,submission.paid)}));}
      }else setSubmissions((items) => {const next=items.filter((item) => item.eventId !== submission.eventId);announcePendingRequestCount(next.length);return next;});
      setState({
        message: `${status === "approved" ? "Approved" : "Rejected"} on ${publication.accepted.length} BitcoinWalk relay(s).${sponsorMessage}${discoveryMessage}`,
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

  const requestCities=[...new Map(submissions.map(submission=>[submission.cityId,{id:submission.cityId,name:submission.cityName,meta:submission.paid?"Pro — paid":submission.city.requestedTier==="paid"?"Pro — payment pending":"Basic",keywords:[submission.slug,submission.cityId,submission.author,...(submission.city.aliases??[])]}])).values()];
  const visibleSubmissions=selectedCity?submissions.filter(submission=>submission.cityId===selectedCity):submissions;

  return (
    <section>
      <h2>Requests</h2>
      <p role="status">
        {state.message}
        {state.approvedWalk && <>{" "}<Link prefetch={false} href={state.approvedWalk.href}>View BitcoinWalk {state.approvedWalk.name} →</Link></>}
      </p>
      <button disabled={busy} type="button" onClick={loadSubmissions}>Refresh</button>
      <CityFinder disabled={busy||!submissions.length} label="Find request by city" placeholder="Search pending city requests…" value={selectedCity} onChange={setSelectedCity} items={requestCities}/>
      {!!submissions.length&&<p>{visibleSubmissions.length} of {submissions.length} pending request(s) shown.</p>}
      {visibleSubmissions.map((submission) => (
        <article key={submission.eventId} id={`submission-${submission.eventId}`}>
          <h2>{submission.paid&&<span role="img" aria-label="Verified Pro city" title="Verified Pro city">⚡</span>} {submission.cityName}</h2>
          <p><strong>{submission.previous?"City change":"New city"}</strong> · {submission.paid?"Pro — paid":submission.city.requestedTier==="paid"?"Pro — payment pending":"Basic"} · {new Date(submission.startAt).toLocaleString()}</p>
          <details>
            <summary>Review request and approval settings</summary>
            <p>{submission.meetingPoint}<br/>{submission.city.description}</p>
            <p>Organizer: {submission.author}<br/>City ID: {submission.cityId}<br/>Revision: {submission.eventId}{submission.previous&&<><br/>Based on: {submission.previous}</>}<br/>Signed walks: {submission.initialEventIds.length||"Missing"}</p>
            <SubmittedCityFields submission={submission}/>
            <label>Public URL <span>bitcoinwalk.org/</span><input required minLength={2} maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slugs[submission.eventId]??(submission.previous?submission.slug:registrationSlug(submission.cityName))} onChange={event=>setSlugs(current=>({...current,[submission.eventId]:event.target.value.toLowerCase()}))}/></label>
            <label>Alternative city names <input maxLength={2020} value={aliases[submission.eventId]??(submission.city.aliases??[]).join(", ")} onChange={event=>setAliases(current=>({...current,[submission.eventId]:event.target.value}))} placeholder="One or more names, separated by commas"/></label>
          </details>
          {!submission.previous&&<section><h3>City image</h3><label>Landscape image URL <input type="url" placeholder="https://…" value={heroImages[submission.eventId]??""} onChange={event=>{setHeroImages(images=>({...images,[submission.eventId]:event.target.value}));setImageStates(current=>({...current,[submission.eventId]:{status:"idle",message:"The image will be validated and stored during approval."}}));}}/></label><p><button disabled={busy} type="button" onClick={()=>generateLandscape(submission)}>{imageStates[submission.eventId]?.status==="waiting"||imageStates[submission.eventId]?.status==="working"?"Generating…":"Generate image"}</button>{" "}<button disabled={busy||!heroImages[submission.eventId]?.trim()||heroImages[submission.eventId]?.includes("/api/media/files/")} type="button" onClick={()=>importLandscape(submission)}>Store image now</button></p>{imageStates[submission.eventId]?.message&&<p role={imageStates[submission.eventId]?.status==="error"?"alert":"status"}>{imageStates[submission.eventId].message}</p>}{heroImages[submission.eventId]?.includes("/api/media/files/")&&<img src={heroImages[submission.eventId]} alt={`Selected landscape for ${submission.cityName}`} style={{maxWidth:"24rem",width:"100%",height:"auto"}}/>}<label className="inline-checkbox"><input type="checkbox" checked={inviteSponsors[submission.eventId]??true} disabled={busy} onChange={event=>setInviteSponsors(current=>({...current,[submission.eventId]:event.target.checked}))}/> Show sponsor invitation</label></section>}
          <p><button disabled={busy||decided[submission.eventId]||!!submission.previous&&!submission.previousCity||!submission.previous&&(!submission.initialEventIds.length||!heroImages[submission.eventId]?.trim())} type="button" onClick={()=>decide(submission,"approved")}>{decided[submission.eventId]?"Approved":"Approve"}</button>{" "}<button disabled={busy||decided[submission.eventId]} type="button" onClick={()=>decide(submission,"rejected")}>Reject</button></p>
          <ul aria-label={`Activation checklist for ${submission.cityName}`}>
            {Object.entries(activationStates[submission.eventId]??{logos:{status:"amber",message:"Generated automatically after approval."},og:{status:"amber",message:"Created automatically from the city image and localized logo."},meta:{status:"amber",message:"Title and description validated automatically."},relay:submission.paid?{status:"amber",message:"Paid relay provisioning will be checked after approval."}:submission.city.requestedTier==="paid"?{status:"amber",message:"Dedicated relay waits for verified payment."}:{status:"na",message:"Basic city — dedicated relay not required."}}).map(([key,check])=><li key={key}><span aria-hidden="true">{check.status==="green"?"🟢":check.status==="red"?"🔴":check.status==="na"?"⚪":"🟠"}</span> <strong>{key==="logos"?"Logo pack":key==="og"?"OG image":key==="meta"?"Meta title and description":"City relay"}</strong> — {check.message}{check.url&&<> <a href={check.url} target="_blank" rel="noreferrer">Preview</a></>}</li>)}
          </ul>
        </article>
      ))}
    </section>
  );
}
