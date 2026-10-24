export type DashboardChatIntent=
 |{kind:"city";city:string}
 |{kind:"guide"|"global"|"hosts"}
 |{kind:"invalid"};

const citySlug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read only navigation intent from the dashboard URL. Account, relay,
 * membership and role claims are deliberately not part of this contract. */
export function parseDashboardChatIntent(search:string):DashboardChatIntent|null{
 const params=new URLSearchParams(search.startsWith("?")?search.slice(1):search),rooms=params.getAll("room"),cities=params.getAll("city");
 if(rooms.length>1||cities.length>1||rooms.length&&cities.length)return {kind:"invalid"};
 if(rooms.length){const room=rooms[0];return room==="guide"||room==="global"||room==="hosts"?{kind:room}:{kind:"invalid"};}
 if(cities.length){const city=cities[0];return city.length<=128&&citySlug.test(city)?{kind:"city",city}:{kind:"invalid"};}
 return null;
}

export function dashboardChatHref(intent:Exclude<DashboardChatIntent,{kind:"invalid"}>|null):string{
 if(!intent)return "/admin/chat";
 return intent.kind==="city"?`/admin/chat?city=${encodeURIComponent(intent.city)}`:`/admin/chat?room=${intent.kind}`;
}

export function dashboardChatProblem(intent:DashboardChatIntent|null,availability:{cityFound:boolean;cityRoom:boolean;guide:boolean;global:boolean;hosts:boolean}):string{
 if(intent?.kind==="invalid")return "This chat link is invalid. Choose an available conversation instead.";
 if(intent?.kind==="city")return !availability.cityFound?"This city chat could not be found.":!availability.cityRoom?"This city chat is not available yet.":"";
 if(intent?.kind==="guide")return availability.guide?"":"BitcoinWalk Guide is not available right now.";
 if(intent?.kind==="global")return availability.global?"":"The Global chat is not available right now.";
 if(intent?.kind==="hosts")return availability.hosts?"":"BitcoinWalk Hosts is available only to current verified city hosts.";
 return "";
}
