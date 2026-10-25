import styles from "../app/admin/sponsors/sponsors.module.css";

export type ArtworkStage="uploaded"|"approved"|"generated"|"applied";
const stages:[ArtworkStage,string,string][]=[
 ["uploaded","Uploaded","The exact sponsor logo is stored privately."],
 ["approved","Approved","BitcoinWalk has approved the exact logo hash."],
 ["generated","Generated","The sponsored 1200 × 630 sharing image is ready."],
 ["applied","Applied","The signed walk assignment now uses this artwork publicly."],
];
export function artworkStageIndex(stage:ArtworkStage){return stages.findIndex(([value])=>value===stage);}
export default function ArtworkLifecycle({stage}:{stage:ArtworkStage}){
 const current=artworkStageIndex(stage);
 return <section className={styles.artworkLifecycle} aria-label="Artwork lifecycle"><h4>Artwork status</h4><ol>{stages.map(([value,label,description],index)=><li key={value} className={index<current?styles.lifecycleDone:index===current?styles.lifecycleCurrent:styles.lifecyclePending}><span aria-hidden="true">{index<=current?"✓":index+1}</span><div><strong>{label}</strong><small>{description}</small></div></li>)}</ol></section>;
}
