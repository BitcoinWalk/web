export type DashboardRole="disconnected"|"organizer"|"member"|"super-admin";
export const dashboardItems=[
 {href:"/admin",label:"Overview",access:"all"},
 {href:"/admin/my-cities",label:"Cities",access:"organizer"},
 {href:"/admin/cities",label:"Cities",access:"admin"},
 {href:"/admin/requests",label:"Requests",access:"admin"},
 {href:"/admin/walks",label:"Walks",access:"connected"},
 {href:"/admin/organizers",label:"Organizers",access:"admin"},
 {href:"/admin/directory",label:"Relay directory",access:"organizer"},
 {href:"/admin/content",label:"Content",access:"admin"},
 {href:"/admin/alerts",label:"Alerts",access:"admin"},
] as const;
export function dashboardNavigation(role:DashboardRole){return dashboardItems.filter(item=>item.access==="all"||item.access==="connected"&&role!=="disconnected"||item.access==="organizer"&&role==="organizer"||item.access==="admin"&&role==="super-admin");}
export type DashboardMenuBadges={cities:number|null;walks:number|null;requests:number|null};
export function dashboardMenuLabel(href:string,label:string,role:DashboardRole,badges:DashboardMenuBadges):string{
 if(href==="/admin/cities"&&role==="super-admin")return `Cities (${badges.cities??"?"})`;
 if(href==="/admin/requests"&&role==="super-admin")return `Requests (${badges.requests??"?"})`;
 if(href==="/admin/walks"&&role==="super-admin")return `Upcoming walks (${badges.walks??"?"})`;
 if(href==="/admin/walks"&&role==="organizer")return `My walks (${badges.walks??"?"})`;
 return label;
}
export function dashboardAccess(path:string,role:DashboardRole){if(path==="/admin/accept-invitation"||path==="/admin/appearance"||Object.hasOwn(legacyDashboardRoutes,path))return true;return dashboardNavigation(role).some(item=>item.href===path);}
export const legacyDashboardRoutes:Record<string,string>={"/organizer":"/admin/walks","/organizer/events":"/admin/walks","/organizer/invitations":"/admin/accept-invitation","/organizer/team":"/admin/walks","/admin/calendar":"/admin/walks","/admin/hosting":"/admin/walks","/admin/approvals":"/admin/requests","/admin/moderation":"/admin/walks?tab=moderation","/admin/editors":"/admin/organizers?tab=editors","/admin/invitations":"/admin/organizers?tab=invitations"};
export function legacyDashboardHref(path:string,search="",hash=""){const target=legacyDashboardRoutes[path];if(!target)throw new Error("Unknown legacy dashboard route");return target+(search?target.includes("?")?`&${search.slice(1)}`:search:"")+hash;}
