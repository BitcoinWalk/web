import { PAID_PRICE_SATS, PLAN_BENEFITS, type RequestedTier } from "../domain/registration";

export function registrationActionLabel(value:RequestedTier,working:boolean){
  if(working)return value==="paid"?"Preparing…":"Submitting…";
  return value==="paid"?"Next":"Submit";
}

export default function RegistrationPlans({ value, onChange, disabled, paidEnabled=true,showHeading=true }: {
  value: RequestedTier; onChange: (value: RequestedTier) => void; disabled: boolean; paidEnabled?:boolean;showHeading?:boolean;
}) {
  if(!paidEnabled)return <section aria-label="Registration plan"><p><strong>Basic plan</strong> — Shared BitcoinWalk relay and global community access. Pro registration is not currently available.</p></section>;
  return <section {...(showHeading?{"aria-labelledby":"plan-heading"}:{"aria-label":"Registration plan"})}>
    {showHeading&&<h2 id="plan-heading">Choose your plan</h2>}
    <fieldset disabled={disabled} style={{ display: "grid", gap: "1rem" }}>
      <legend>Requested tier</legend>
      <label style={{ display: "flex", alignItems: "center" }}><input type="radio" name="requestedTier" value="free" checked={value === "free"} onChange={() => onChange("free")} /> Basic — 0 sats</label>
      <label style={{ display: "flex", alignItems: "center" }}><input type="radio" name="requestedTier" value="paid" checked={value === "paid"} onChange={() => onChange("paid")} /> Pro — {PAID_PRICE_SATS.toLocaleString("en-US")} sats once · lifetime access</label>
    </fieldset>
    <details className="registration-plan-benefits">
      <summary>See what you get in each tier</summary>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption className="sr-only">Basic and Pro benefits</caption>
          <thead><tr><th scope="col">Benefit</th><th scope="col">Basic</th><th scope="col">Pro</th></tr></thead>
          <tbody>{PLAN_BENEFITS.map(row => <tr key={row.benefit}>{[row.benefit, row.free, row.paid].map((cell,index)=>index===0?<th scope="row" key={index}>{cell}</th>:<td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
