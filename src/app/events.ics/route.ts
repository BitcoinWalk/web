import {eventsIcalendar} from "../../server/public-event-formats";
import {loadPublicEventsFeed} from "../../server/public-events-feed";
import {shareOrigin} from "../../server/share-preview";

export const dynamic="force-dynamic",runtime="nodejs";
export async function GET(){try{return new Response(eventsIcalendar(await loadPublicEventsFeed(),shareOrigin()),{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"inline; filename=bitcoinwalk-events.ics","Cache-Control":"public, max-age=60, stale-while-revalidate=300","Access-Control-Allow-Origin":"*"}});}catch{return new Response("The verified future-events calendar is temporarily unavailable.\n",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});}}
