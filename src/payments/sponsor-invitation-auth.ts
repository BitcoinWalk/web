import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";

export type SponsorInvitationCommand=
 |{action:"list"}
 |{action:"create";id:string;cityId:string;tokenHash:string;expiresAt:number}
 |{action:"revoke";id:string};

export function sponsorInvitationRequest(origin:string,command:SponsorInvitationCommand):EventTemplate{
 return {kind:27235,created_at:Math.floor(Date.now()/1000),tags:[["u",`${origin}/api/sponsor-invitations`],["method","POST"],["t","bitcoinwalk-sponsor-invitation-v1"]],content:JSON.stringify(command)};
}

export function authorizeSponsorInvitation(event:Event,origin:string,command:SponsorInvitationCommand):string{
 const expected=sponsorInvitationRequest(origin,command);
 if(!verifyEvent(event)||event.kind!==27235||Math.abs(Date.now()/1000-event.created_at)>300||JSON.stringify(event.tags)!==JSON.stringify(expected.tags)||event.content!==expected.content)throw new Error("Connect your host identity and sign again.");
 return event.pubkey;
}
