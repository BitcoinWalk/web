import type {DashboardSession} from "../components/dashboard-context";

export function organizerDirectorySnapshot(session:DashboardSession,pubkey:string){
 if(session.pubkey!==pubkey||session.directory===null)return null;
 return {grants:session.grants,...session.directory};
}
