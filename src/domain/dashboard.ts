export type DashboardRole="disconnected"|"organizer"|"member"|"super-admin";
export type DashboardCapabilities={hostedWalks?:boolean};
export const dashboardItems=[
 {href:"/admin",label:"Overview",access:"all"},
 {href:"/admin/my-cities",label:"Cities",access:"organizer"},
 {href:"/admin/cities",label:"Cities",access:"admin"},
 {href:"/admin/requests",label:"Requests",access:"admin"},
 {href:"/admin/walks",label:"Walks",access:"walks"},
 {href:"/admin/sponsor",label:"Sponsorships",access:"connected"},
 {href:"/admin/chat",label:"Chat",access:"connected"},
 {href:"/admin/guide",label:"Guide",access:"connected"},
 {href:"/admin/organizers",label:"Hosts",access:"admin"},
 {href:"/admin/content",label:"Content",access:"admin"},
 {href:"/admin/directory",label:"City relay setup",access:"relay"},
 {href:"/admin/monitoring/alerts",label:"Monitoring",access:"admin"},
] as const;
export function dashboardNavigation(role:DashboardRole,capabilities:DashboardCapabilities={}){return dashboardItems.filter(item=>item.access==="all"||item.access==="connected"&&role!=="disconnected"||item.access==="walks"&&(role==="organizer"||role==="super-admin"||role==="member"&&capabilities.hostedWalks===true)||item.access==="organizer"&&role==="organizer"||item.access==="admin"&&role==="super-admin"||item.access==="relay"&&(role==="organizer"||role==="super-admin"));}
export function dashboardProfileVisible(path:string){return path==="/admin";}
export type DashboardMenuBadges={cities:number|null;walks:number|null;requests:number|null};
export function dashboardMenuLabel(href:string,label:string,role:DashboardRole,badges:DashboardMenuBadges):string{
 if(href==="/admin/cities"&&role==="super-admin")return `Cities (${badges.cities??"?"})`;
 if(href==="/admin/requests"&&role==="super-admin")return `Requests (${badges.requests??"?"})`;
 if(href==="/admin/walks"&&role==="super-admin")return `Upcoming walks (${badges.walks??"?"})`;
 if(href==="/admin/walks"&&role==="organizer")return `My walks (${badges.walks??"?"})`;
 if(href==="/admin/walks"&&role==="member")return `Walks I host (${badges.walks??"?"})`;
 if(href==="/admin/sponsor"&&role==="super-admin")return "Sponsors";
 return label;
}
export function dashboardAccess(path:string,role:DashboardRole){if(path==="/admin/upgrade"||path==="/admin/pro-setup"||path==="/admin/madeira-pilot")return role!=="disconnected";if(path==="/admin/walks"||path==="/admin/sponsor"||path==="/admin/sponsors")return role!=="disconnected";if(path.startsWith("/admin/sponsors/"))return role==="super-admin";if(path==="/admin/alerts")return role==="super-admin";if(path==="/admin/accept-invitation"||path==="/admin/appearance"||Object.hasOwn(legacyDashboardRoutes,path))return true;if(path==="/admin/monitoring"||path.startsWith("/admin/monitoring/"))return role==="super-admin";return dashboardNavigation(role).some(item=>item.href===path);}

export type DashboardHomeAction={href:string;label:string;description:string};
export function dashboardHomeCopy(role:DashboardRole){
 if(role==="super-admin")return {title:"BitcoinWalk operations",intro:"Review requests, manage cities and keep BitcoinWalk services healthy."};
 if(role==="organizer")return {title:"Your BitcoinWalk workspace",intro:"Plan walks, manage your cities and keep your local community up to date."};
 return {title:"Welcome to BitcoinWalk",intro:"Find a walk, join your city chat or support a local BitcoinWalk."};
}
export function dashboardHomeActions(role:DashboardRole,capabilities:DashboardCapabilities={}):DashboardHomeAction[]{
 if(role==="super-admin")return [
  {href:"/admin/requests",label:"Review requests",description:"Approve city and Pro identity requests."},
  {href:"/admin/cities",label:"Manage cities",description:"Review city health, moderation and public status."},
  {href:"/admin/walks",label:"Manage walks",description:"Review upcoming walks and walk visibility."},
  {href:"/admin/sponsor",label:"Manage sponsors",description:"Review sponsorships, payments and artwork."},
 ];
 if(role==="organizer")return [
  {href:"/admin/walks",label:"Manage walks",description:"Add a walk or update an existing one."},
  {href:"/admin/my-cities",label:"Manage cities",description:"Update your city profile and setup."},
  {href:"/admin/chat",label:"Open chat",description:"Join your city and global conversations."},
  {href:"/admin/sponsor",label:"Sponsorships",description:"See sponsored walks and payment history."},
 ];
 return [
  ...(capabilities.hostedWalks?[{href:"/admin/walks",label:"Walks you host",description:"Open your accepted hosting assignments."}]:[]),
  {href:"/",label:"Find a walk",description:"Explore upcoming BitcoinWalks by city."},
  {href:"/admin/chat",label:"Open chat",description:"Join your city and global conversations."},
  {href:"/admin/sponsor",label:"Sponsorships",description:"See your sponsorships or support a local walk."},
  {href:"/start",label:"Start a BitcoinWalk",description:"Apply to organize BitcoinWalk in your city."},
 ];
}
export const legacyDashboardRoutes:Record<string,string>={"/organizer":"/admin/walks","/organizer/events":"/admin/walks","/organizer/invitations":"/admin/accept-invitation","/organizer/team":"/admin/walks","/admin/calendar":"/admin/walks","/admin/hosting":"/admin/walks","/admin/approvals":"/admin/requests","/admin/moderation":"/admin/walks?tab=moderation","/admin/editors":"/admin/organizers?tab=editors","/admin/invitations":"/admin/organizers?tab=invitations"};
export function legacyDashboardHref(path:string,search="",hash=""){const target=legacyDashboardRoutes[path];if(!target)throw new Error("Unknown legacy dashboard route");return target+(search?target.includes("?")?`&${search.slice(1)}`:search:"")+hash;}
