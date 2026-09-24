export type DashboardRole="disconnected"|"organizer"|"member"|"super-admin";
export const dashboardItems=[
 {href:"/admin",label:"Overview",access:"all"},
 {href:"/admin/walks",label:"Walks",access:"connected"},
 {href:"/admin/cities",label:"Cities",access:"admin"},
 {href:"/admin/invitations",label:"Invite organizers",access:"admin"},
] as const;
export function dashboardNavigation(role:DashboardRole){return dashboardItems.filter(item=>item.access==="all"||item.access==="connected"&&role!=="disconnected"||item.access==="admin"&&role==="super-admin");}
export function dashboardAccess(path:string,role:DashboardRole){if(path==="/admin/accept-invitation"||Object.hasOwn(legacyDashboardRoutes,path))return true;return dashboardNavigation(role).some(item=>item.href===path);}
export const legacyDashboardRoutes:Record<string,string>={"/organizer":"/admin/walks","/organizer/events":"/admin/walks","/organizer/invitations":"/admin/accept-invitation","/organizer/team":"/admin/walks","/admin/calendar":"/admin/walks","/admin/hosting":"/admin/walks","/admin/approvals":"/admin/cities?tab=requests","/admin/moderation":"/admin/cities?tab=manage","/admin/editors":"/admin/cities?tab=editors"};
export function legacyDashboardHref(path:string,search="",hash=""){const target=legacyDashboardRoutes[path];if(!target)throw new Error("Unknown legacy dashboard route");return target+(search?target.includes("?")?`&${search.slice(1)}`:search:"")+hash;}
