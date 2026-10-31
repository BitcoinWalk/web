export type ProCommunityHandoffState="confirmed"|"action-required"|"unknown";
export type ProCommunityHandoffOutcomes={checked:number;confirmed:number;actionRequired:number;unknown:number;checkedAt:number};

/** Current receiving-side community evidence. No city, owner or room identifier leaves this aggregate. */
export function summarizeProCommunityHandoffs(states:ProCommunityHandoffState[],checkedAt:number):ProCommunityHandoffOutcomes{
 let confirmed=0,actionRequired=0,unknown=0;
 for(const state of states){if(state==="confirmed")confirmed++;else if(state==="action-required")actionRequired++;else unknown++;}
 return {checked:states.length,confirmed,actionRequired,unknown,checkedAt};
}
