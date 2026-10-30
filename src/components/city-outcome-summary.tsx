import type {CityOutcomeReport} from "../payments/city-outcomes";
import styles from "../app/admin/sponsors/sponsors.module.css";

export default function CityOutcomeSummary({report,days}:{report:CityOutcomeReport;days:number}){
 return <section className={styles.outcomeReport} aria-labelledby="city-outcome-heading">
  <header><div><h2 id="city-outcome-heading">City setup outcomes</h2><p>Current saved progress for city setups started in the last {days} days. Each city is counted once.</p></div><small>Aggregate only · no identities or wallet details</small></header>
  {report.status==="unavailable"?<p role="status">City setup reporting is unavailable. Refresh to retry; sponsorship reporting is unaffected.</p>:<>
   <div className={styles.outcomeMetrics}><div><strong>{report.started}</strong><span>Setups started</span></div><div><strong>{report.preparationReady}</strong><span>Organizer preparation ready</span></div><div><strong>{report.identityPublished}</strong><span>City identities published</span></div><div><strong>{report.servicesActive}</strong><span>Address services activated</span></div></div>
   <p className={styles.outcomeDetail}>{report.needsAttention} activation tasks need attention.</p>
  </>}
  <details><summary>What these numbers mean</summary><p>Preparation requires saved payout, signer recovery and artwork. Publication requires matching recorded binding evidence. Address activation requires recorded NIP-05 and Lightning activation for the matching request and payout version.</p><p>This is saved operational state, not a live health check, full Pro completion or historical conversion timing. Counts can fall after a reset or ownership change. App installation and community handoff are not measured here.</p></details>
 </section>;
}
