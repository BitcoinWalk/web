import { PAID_PRICE_SATS, PLAN_BENEFITS, type RequestedTier } from "../domain/registration";

export default function RegistrationPlans({ value, onChange, disabled }: {
  value: RequestedTier; onChange: (value: RequestedTier) => void; disabled: boolean;
}) {
  return <section aria-labelledby="plan-heading">
    <h2 id="plan-heading">Choose your plan</h2>
    <fieldset disabled={disabled} style={{ display: "grid", gap: "1rem" }}>
      <legend>Requested tier</legend>
      <label style={{ display: "flex", alignItems: "center" }}><input type="radio" name="requestedTier" value="free" checked={value === "free"} onChange={() => onChange("free")} /> Free — 0 sats</label>
      <label style={{ display: "flex", alignItems: "center" }}><input type="radio" name="requestedTier" value="paid" checked={value === "paid"} onChange={() => onChange("paid")} /> Paid — {PAID_PRICE_SATS.toLocaleString("en-US")} sats once · lifetime access</label>
    </fieldset>
    <p>No recurring subscription. The 21% BitcoinWalk franchise share applies to payments through the paid city Lightning address; it is separate from the one-time fee.</p>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <caption style={{ textAlign: "left", padding: "1rem 0" }}>Free and Paid benefits</caption>
        <thead><tr><th scope="col">Benefit</th><th scope="col">Free</th><th scope="col">Paid</th></tr></thead>
        <tbody>{PLAN_BENEFITS.map(row => <tr key={row.benefit}>{[row.benefit, row.free, row.paid].map((cell, index) => index === 0 ? <th scope="row" key={index} style={{ padding: "0.75rem", textAlign: "left", borderBottom: "1px solid #ddd" }}>{cell}</th> : <td key={index} style={{ padding: "0.75rem", borderBottom: "1px solid #ddd" }}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p>NIP-05 identifies the city account; it is not an endorsement or guarantee of trust. Members-only chat is accessed through Armada, not a BitcoinWalk-hosted Armada app.</p>
    <p>Node apps, relay transfer and the marketplace are planned, not available in this release.</p>
    {value === "paid" && <p role="status"><strong>Paid activation is not connected yet.</strong> We record your Paid preference for review. No payment is taken and no dedicated relay, subdomain, NIP-05 or Lightning address is activated by submitting or approving a walk. Payment and provisioning come after approval.</p>}
  </section>;
}
