import type {ReactNode} from "react";
import { PAID_PRICE_SATS, PLAN_BENEFITS, type RequestedTier } from "../domain/registration";

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
    <p>No recurring subscription. The 21% BitcoinWalk franchise share applies to payments through the paid city Lightning address; it is separate from the one-time fee.</p>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <caption style={{ textAlign: "left", padding: "1rem 0" }}>Basic and Pro benefits</caption>
        <thead><tr><th scope="col">Benefit</th><th scope="col">Basic</th><th scope="col">Pro</th></tr></thead>
        <tbody>{PLAN_BENEFITS.map(row => <tr key={row.benefit}>{[row.benefit, row.free, row.paid].map((cell, index) => index === 0 ? <th scope="row" key={index} style={{ padding: "0.75rem", textAlign: "left", borderBottom: "1px solid #ddd" }}>{cell}</th> : <td key={index} style={{ padding: "0.75rem", borderBottom: "1px solid #ddd" }}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p>NIP-05 identifies the city account; it is not an endorsement or guarantee of trust. Members-only chat is accessed through Armada, not a BitcoinWalk-hosted Armada app.</p>
    <p>Node apps, relay transfer and the marketplace are planned, not available in this release.</p>
  </section>;
}
