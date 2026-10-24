import type {Nip29CityRoom,Nip29Room} from "../nostr/nip29-chat";
import {chatTargetPath} from "./chat-target";

/** Return the canonical public room link for the active browser conversation.
 * This is navigation context only; it grants no relay membership or role. */
export function canonicalChatPromotionPath(input:{guideSelected:boolean;room?:Nip29Room|null;cities:Nip29CityRoom[]}):string|null {
 if(input.guideSelected)return chatTargetPath({version:1,kind:"guide"});
 if(!input.room)return null;
 if(input.room.scope==="global")return chatTargetPath({version:1,kind:"global"});
 if(input.room.scope==="organizers"||input.room.scope==="hosts")return chatTargetPath({version:1,kind:"hosts"});
 const city=input.cities.find(row=>input.room!.cityIds.includes(row.id));
 return city?chatTargetPath({version:1,kind:"city",cityId:city.id},city.slug):null;
}
