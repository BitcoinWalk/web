import {loadPublicEventsFeed} from "../../../server/public-events-feed";

export const dynamic="force-dynamic",runtime="nodejs";

export async function GET(){
 try{
  return Response.json(await loadPublicEventsFeed(),{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300","Access-Control-Allow-Origin":"*"}});
 }catch{
  return Response.json({error:"The verified future-events feed is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});
 }
}
