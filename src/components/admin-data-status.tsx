import styles from "./admin-data-status.module.css";

export type AdminDataState="loading"|"ready"|"empty"|"partial"|"stale"|"failed";
export type AdminDataHealth={state:AdminDataState;message:string;checkedAt?:string};
export function resolvedAdminDataState({incomplete,retainedData,hasFreshData,visibleCount}:{incomplete:boolean;retainedData:boolean;hasFreshData:boolean;visibleCount:number}):AdminDataState{
 if(!incomplete)return visibleCount>0?"ready":"empty";
 if(retainedData)return "stale";
 return hasFreshData?"partial":"failed";
}

const labels:Record<AdminDataState,string>={
 loading:"Refreshing data",
 ready:"Data up to date",
 empty:"Nothing here yet",
 partial:"Some data unavailable",
 stale:"Showing last known data",
 failed:"Data unavailable",
};

export default function AdminDataStatus({health,onRetry,busy=false,scope="Dashboard",hideWhenReady=false}:{health:AdminDataHealth;onRetry?:()=>void;busy?:boolean;scope?:string;hideWhenReady?:boolean}){
 if(hideWhenReady&&health.state==="ready")return null;
 const needsAttention=health.state==="partial"||health.state==="stale"||health.state==="failed";
 return <div className={styles.status} data-state={health.state} role={health.state==="failed"?"alert":"status"} aria-live={health.state==="failed"?"assertive":"polite"} aria-label={`${scope} data status`}>
  <span className={styles.dot} aria-hidden="true"/>
  <div className={styles.copy}><strong>{labels[health.state]}</strong><span>{health.message}</span>{health.checkedAt&&<small>Checked {new Date(health.checkedAt).toLocaleString()}</small>}</div>
  {onRetry&&needsAttention&&<button className={styles.retry} type="button" disabled={busy} onClick={onRetry}>{busy?"Retrying…":"Retry"}</button>}
 </div>;
}
