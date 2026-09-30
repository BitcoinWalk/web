import type {ReactNode} from "react";
import { PAID_PRICE_SATS, type RequestedTier } from "../domain/registration";

export default function RegistrationPlans({ value, onChange, disabled, paidEnabled=true,showHeading=true,paidCheckout }: {
  value: RequestedTier; onChange: (value: RequestedTier) => void; disabled: boolean; paidEnabled?:boolean;showHeading?:boolean;paidCheckout?:ReactNode;
}) {
  if(!paidEnabled)return <section aria-label="Registration plan"><p><strong>Basic plan</strong> — Shared BitcoinWalk relay and global community access. Pro registration is not currently available.</p></section>;
  return <section {...(showHeading?{"aria-labelledby":"plan-heading"}:{"aria-label":"Registration plan"})}>
    {showHeading&&<h2 id="plan-heading">Choose your plan</h2>}
    <fieldset disabled={disabled} style={{ display: "grid", gap: "1rem" }}>
      <legend>Requested tier</legend>
      <label style={{ display: "flex", alignItems: "center" }}><input type="radio" name="requestedTier" value="free" checked={value === "free"} onChange={() => onChange("free")} /> Basic — 0 sats</label>
      <label style={{ display: "flex", alignItems: "center" }}><input type="radio" name="requestedTier" value="paid" checked={value === "paid"} onChange={() => onChange("paid")} /> Pro — {PAID_PRICE_SATS.toLocaleString("en-US")} sats once · lifetime access</label>
    </fieldset>
    {value === "paid" && (paidCheckout??<p role="status">Submit your signed city request to generate the 21,000-sat Pro invoice here.</p>)}
  </section>;
}
