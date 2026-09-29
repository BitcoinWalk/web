"use client";
import {useEffect,useState} from "react";
import CityEditors from "../editors/_screen";
import OrganizerInvitations from "../../../components/organizer-invitations";
import OrganizerSuspensionPanel from "../../../components/organizer-suspension";

type OrganizerTab="editors"|"invitations"|"publishing";
export function organizerTabFromLocation(search:string):OrganizerTab{const value=new URLSearchParams(search).get("tab");return value==="invitations"||value==="publishing"?value:"editors";}
export default function OrganizersPage(){
 const [tab,setTab]=useState<OrganizerTab>("editors");
 useEffect(()=>{const sync=()=>setTab(organizerTabFromLocation(window.location.search));sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
 function select(next:OrganizerTab){const url=new URL(window.location.href);url.searchParams.set("tab",next);window.history.replaceState(null,"",url);setTab(next);}
 return <main><h1>Organizers</h1><p>Manage who can edit each city, invite new organizers, and control organizer-wide publishing access.</p><div role="tablist" aria-label="Organizer administration"><button type="button" role="tab" aria-selected={tab==="editors"} onClick={()=>select("editors")}>City editors</button><button type="button" role="tab" aria-selected={tab==="invitations"} onClick={()=>select("invitations")}>Invite organizers</button><button type="button" role="tab" aria-selected={tab==="publishing"} onClick={()=>select("publishing")}>Publishing access</button></div><div role="tabpanel">{tab==="editors"?<CityEditors/>:tab==="invitations"?<OrganizerInvitations/>:<OrganizerSuspensionPanel/>}</div></main>;
}
