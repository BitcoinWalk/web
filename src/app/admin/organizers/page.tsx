"use client";
import {useEffect,useState} from "react";
import CityEditors from "../editors/_screen";
import OrganizerInvitations from "../../../components/organizer-invitations";
import OrganizerSuspensionPanel from "../../../components/organizer-suspension";
import OrganizerDirectory from "../../../components/organizer-directory";
import AdminTabs,{AdminTabPanel} from "../../../components/admin-tabs";
import {AdminPageHeader} from "../../../components/admin-ui";

type OrganizerTab="directory"|"editors"|"invitations"|"publishing";
export function organizerTabFromLocation(search:string):OrganizerTab{const value=new URLSearchParams(search).get("tab");return value==="editors"||value==="invitations"||value==="publishing"?value:"directory";}
export default function OrganizersPage(){
 const [tab,setTab]=useState<OrganizerTab>("directory");
 useEffect(()=>{const sync=()=>setTab(organizerTabFromLocation(window.location.search));sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
 function select(next:OrganizerTab){const url=new URL(window.location.href);url.searchParams.set("tab",next);window.history.replaceState(null,"",url);setTab(next);}
 const tabs=[{id:"directory" as const,label:"All hosts"},{id:"editors" as const,label:"City editors"},{id:"invitations" as const,label:"Invite hosts"},{id:"publishing" as const,label:"Publishing access"}];
 return <main><AdminPageHeader title="Hosts" description="Browse city hosts and their cities, manage editor access, send invitations, and control host-wide publishing."/><AdminTabs tabs={tabs} value={tab} onChange={select} label="Host administration" idPrefix="hosts"/><AdminTabPanel idPrefix="hosts" value={tab}>{tab==="directory"?<OrganizerDirectory/>:tab==="editors"?<CityEditors/>:tab==="invitations"?<OrganizerInvitations/>:<OrganizerSuspensionPanel/>}</AdminTabPanel></main>;
}
