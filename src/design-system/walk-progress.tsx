import styles from "./walk-progress.module.css";

const steps = ["Walk", "Access", "Plan"];

/** Read-only progress: navigation remains with the form's existing controls. */
export default function WalkProgress({step, hideSummary=false}:{step:1|2|3;hideSummary?:boolean}) {
  return <nav className={styles.progress} aria-label="Start a walk progress">
    {!hideSummary&&<p>Start a walk <span>Step {step} of {steps.length}</span></p>}
    <ol>{steps.map((label,index)=><li key={label} aria-current={step===index+1?"step":undefined} data-complete={step>index+1}>
      <span className={styles.number} aria-hidden="true">{step>index+1?"✓":index+1}</span><span>{label}</span>
    </li>)}</ol>
  </nav>;
}
