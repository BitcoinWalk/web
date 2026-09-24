import Link from "next/link";
import type {DashboardSummary} from "../nostr/dashboard-data";
import type {HostedWalk} from "../nostr/hosted-walks";
import {calendarNevent} from "../nostr/calendar-records";
import {eventPageHref} from "../domain/event-routing";
import {directoryConfig} from "../lib/directory-config";
import {relayConfig} from "../lib/relay-config";
import type {DashboardRole} from "../domain/dashboard";

function WalkPreview({title,items,href}:{title:string;items:HostedWalk[]|null;href:string}){
 return <section><h2>{title}</h2>{items===null?<p>Unavailable — refresh the overview to retry.</p>:!items.length?<p>No current or upcoming walks returned.</p>:<ol>{items.map(({walk,item})=>{
  const city=walk.revision.city;
  const date=new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{timeZone:"UTC"})}).format(new Date(item.start*1000));
  return <li key={item.event.id}><strong>{city.cityName}</strong> — {item.status==="active"?"Happening now":item.status==="grace"?"Late-arrival window":"Upcoming"}<br/>
   {date} ({item.timeZone??"UTC"})<br/>{item.meetingPoint.description}<br/>
   <a href={eventPageHref(city.cityId,city.slug,calendarNevent(item.event,relayConfig.readRelays),directoryConfig.paidCities)}>Open walk event ↗</a>
  </li>;
 })}</ol>}<p>Showing up to five walks, earliest first. <Link href={href}>View full list →</Link></p></section>;
}

export default function DashboardUpcoming({summary,role}:{summary:DashboardSummary;role:DashboardRole}){
 return <>
  <section><h2>Needs attention</h2>
   {role==="super-admin"&&(summary.pendingReviews===null?<p>Approval requests unavailable.</p>:summary.pendingReviews.length?<><h3>Pending approvals ({summary.pending.value})</h3><ul>{summary.pendingReviews.map(r=><li key={r.event.id}><Link href={"/admin/cities?tab=requests#submission-"+r.event.id}>Review {r.city.cityName} →</Link></li>)}</ul><Link href="/admin/cities?tab=requests">View all approvals →</Link></>:<p>No pending approvals returned.</p>)}
   {role!=="member"&&(summary.unscheduled===null?<p>Schedule checks unavailable. A failed read does not mean a city has no walks.</p>:summary.unscheduled.length?<><h3>Approved cities with no current or upcoming walks ({summary.unscheduled.length})</h3><ul>{summary.unscheduled.slice(0,5).map(city=><li key={city.id}>{city.name}</li>)}</ul><p>Open <Link href="/admin/walks">Walks →</Link> and choose + Add a walk.</p></>:<p>{summary.cities.value===0?"No approved cities to schedule in this view.":"All returned approved cities have a current or upcoming walk."}</p>)}
   {role==="member"&&<p>Your accepted hosting assignments are shown below. Hosting does not grant city editing or publishing access.</p>}
  </section>
  {role!=="member"&&<WalkPreview title="Next scheduled walks" items={summary.nextWalks} href="/admin/walks"/>}
  <WalkPreview title="Next walks you’re hosting" items={summary.nextHosting} href="/admin/walks"/>
 </>;
}
