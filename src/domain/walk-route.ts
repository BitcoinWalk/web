const ALLTRAILS_HOSTS=new Set(["alltrails.com","www.alltrails.com"]);

export function allTrailsRoute(value:string):{url:string;embedUrl:string|null}|null{
 const input=value.trim();if(!input)return null;
 let url:URL;try{url=new URL(input);}catch{throw new Error("Enter a valid AllTrails HTTPS route URL.");}
 if(url.protocol!=="https:"||!ALLTRAILS_HOSTS.has(url.hostname.toLowerCase())||url.username||url.password||url.port)throw new Error("Only public AllTrails route links are supported.");
 if(/^\/explore\/custom-routes\/[a-z0-9][a-z0-9-]*\/?$/i.test(url.pathname)){
  url.hostname="www.alltrails.com";url.hash="";
  // Custom-route share links have no verified widget mapping; keep the original destination.
  return{url:url.toString(),embedUrl:null};
 }
 const path=url.pathname.replace(/\/+$/,""),match=path.match(/^\/(?:explore\/)?trail\/(.+)$/)||path.match(/^\/widget\/trail\/(.+)$/);
 if(!match?.[1])throw new Error("Use an AllTrails trail, custom-route share link or trail widget URL.");
 const suffix=match[1];url.hostname="www.alltrails.com";url.pathname=`/explore/trail/${suffix}`;url.hash="";
 const embed=new URL(url);embed.pathname=`/widget/trail/${suffix}`;
 return{url:url.toString(),embedUrl:embed.toString()};
}

export function optionalAllTrailsRoute(value:string):string|undefined{return value.trim()?allTrailsRoute(value)!.url:undefined;}
