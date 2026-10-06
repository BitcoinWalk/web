import styles from "./feature-flag-switch.module.css";

type FeatureFlagSwitchProps={
  checked:boolean;
  disabled?:boolean;
  label:string;
  onChange:(checked:boolean)=>void;
};

export function FeatureFlagSwitch({checked,disabled=false,label,onChange}:FeatureFlagSwitchProps){
  return <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={styles.switch}
    data-checked={checked}
    disabled={disabled}
    onClick={()=>onChange(!checked)}
  >
    <span className={styles.track} aria-hidden="true"/>
    <span className={styles.state}>{checked?"ON":"OFF"}</span>
  </button>;
}
