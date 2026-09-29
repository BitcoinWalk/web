export type OrganizerPublishingAccess="checking"|"active"|"suspended"|"unverified";

export function publishingAccessNotice(state:OrganizerPublishingAccess):string{
 if(state==="suspended")return "This account’s publishing access is suspended. Contact the BitcoinWalk administrator.";
 if(state==="unverified")return "Publishing access could not be verified. Refresh to try again; no walks can be added or changed.";
 if(state==="checking")return "Checking publishing access…";
 return "";
}
