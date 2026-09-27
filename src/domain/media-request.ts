import {z} from "zod";
import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
export const MEDIA_REQUEST_KIND=27235;
export const mediaRequestSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("import-city-image"),cityId:z.string().uuid(),sourceUrl:z.url()}),
 z.object({action:z.literal("generate-city-image"),cityId:z.string().uuid(),cityRevisionId:z.string().regex(/^[0-9a-f]{64}$/)}),
 z.object({action:z.literal("list-media-alerts")}),
 z.object({action:z.literal("list-replication-status")}),
]);
export type MediaRequest=z.infer<typeof mediaRequestSchema>;
export function mediaRequestTemplate(request:MediaRequest,now=Math.floor(Date.now()/1000)):EventTemplate{return {kind:MEDIA_REQUEST_KIND,created_at:now,tags:[["t","bitcoinwalk-media"],["action",request.action]],content:JSON.stringify(request)};}
export function parseMediaRequest(event:Event,now=Math.floor(Date.now()/1000)):MediaRequest|null{if(event.kind!==MEDIA_REQUEST_KIND||!verifyEvent(event)||Math.abs(now-event.created_at)>300)return null;if(event.tags.length!==2||event.tags.filter(tag=>tag.length===2&&tag[0]==="t"&&tag[1]==="bitcoinwalk-media").length!==1)return null;try{const parsed=mediaRequestSchema.safeParse(JSON.parse(event.content));return parsed.success&&event.tags.some(tag=>tag.length===2&&tag[0]==="action"&&tag[1]===parsed.data.action)?parsed.data:null;}catch{return null;}}
