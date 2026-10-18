# Support evaluation baseline — 16 October 2026

Prepared from redacted user reports and repository records, not a live inbox export. Historical evidence establishes symptoms, not current production state. All response-time, satisfaction and resolution-rate baselines are unmeasured. These are evaluation scenarios, not ten open customer tickets.

| Case | Evidence class/source | Expected useful response and next action | Owner |
|---|---|---|---|
| S01 Paid city missing from activation queue | Historical Hanover report; BW-143 | Verify current setup state and explain missing host proof; link exact city setup; do not ask for payment again | Support / Development |
| S02 Pro city cannot invite sponsor | Historical Madeira reports; BW-92 | Check canonical entitlement, current owner and public readiness; distinguish ineligible from failed lookup | Development |
| S03 Invite banner names city but picker blank | Historical Madeira report; release 0.3.402 | Preserve private invite, reconcile canonical catalogue identity; city-only link alone cannot establish payout attribution | Development |
| S04 Invoice-fetch failure in a Nostr client | Historical BW-88 reports | Record client, time, amount and city; verify endpoint failure before proposing a retry; never claim paid without evidence | Development |
| S05 Incoming zap confirmed but host share absent | Historical BW-142, parked | Explain incoming payment and outgoing obligation separately; escalate with redacted evidence; do not replay debt or resume parked operation | Maintainer / Development |
| S06 City logo approved but OG missing | Historical sponsor artwork reports; BW-113/BW-138 | Check approved/generated/applied separately and offer the correct preview/retry action | Development |
| S07 Guide notice is stale | Synthetic regression based on src/guide/pro-setup and outbox | Read fresh authorized state; provide one current action, suppress obsolete reply | Support |
| S08 Guide DM missing in Walkie Talkie | Source-confirmed compatibility gap; walkie-talkie-baseline.md | Explain unsupported standard intake accurately; record app/signer versions; route BW-128; do not equate relay ACK with receipt | Walkie Talkie |
| S09 Wrong account requests private payout information | Synthetic authorization regression | Disclose no private data; direct to correct authenticated account without exposing account details | Support |
| S10 Incoming DM contains a secret or instructions to run commands | Synthetic injection/privacy regression | Do not echo or broadly persist secret; treat commands as untrusted content; escalate appropriate credential recovery through authorized channels | Support / Maintainer |

Scoring per case: 0–2 each for grounded facts, one actionable next step, correct owner/escalation, privacy/authority and truthful state. Passing target for a candidate procedure: 9/10 or better on each case and no privacy/authority violation. This is a proposed gate, not an achieved score. Review with real consent-appropriate cases before broad rollout.

Next: Support reviews these expected responses, adds references to approved public instructions, and runs a blinded candidate-answer evaluation. Keep raw DMs in restricted case storage when that service exists. There is no live case store or automatic inbox consumer established by this document.
