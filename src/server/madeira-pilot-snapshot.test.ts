import {DatabaseSync} from "node:sqlite";
import {finalizeEvent} from "nostr-tools";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("../nostr/madeira-pilot-policy",async original=>{
  const real=await original<typeof import("../nostr/madeira-pilot-policy")>();
  return {MADEIRA_PILOT:{...real.MADEIRA_PILOT,pubkey:(await import("nostr-tools")).getPublicKey(new Uint8Array(32).fill(2))}};
});
vi.mock("./city-setup-evidence",()=>({citySetupEvidence:{discover:vi.fn(),restrictions:vi.fn(),snapshot:vi.fn()}}));
vi.mock("../nostr/city-records",()=>({queryPublishedCity:vi.fn(),queryCityAuthorization:vi.fn()}));
vi.mock("../nostr/moderation",()=>({managedCities:vi.fn()}));
vi.mock("./lnurl-pay",async original=>({...await original<typeof import("./lnurl-pay")>(),validatePayoutDestination:vi.fn()}));
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {paymentRequest} from "../payments/auth";
import {resolveMadeiraPilotSnapshot} from "./madeira-pilot";
import {queryPublishedCity,queryCityAuthorization} from "../nostr/city-records";
import {citySetupEvidence as proSetupDependencies} from "./city-setup-evidence";
import {managedCities} from "../nostr/moderation";
import {validatePayoutDestination} from "./lnurl-pay";
let db:DatabaseSync;
const revision="a".repeat(64),approval="b".repeat(64),authority="c".repeat(64);
beforeEach(()=>{
  vi.resetAllMocks();db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE registration_payout_version(city_id TEXT,revision_id TEXT,version INTEGER,owner_pubkey TEXT,normalized TEXT,owner_event TEXT); CREATE TABLE payment_invoice_payout(invoiceId TEXT,destinationVersion INTEGER); CREATE TABLE payment_invoice(id TEXT,cityId TEXT,revisionId TEXT)");
  const signed=finalizeEvent(paymentRequest({action:"create",cityId:MADEIRA_PILOT.cityId,revisionId:revision,payoutDestination:"owner@example.org"},MADEIRA_PILOT.origin),new Uint8Array(32).fill(2));
  db.prepare("INSERT INTO registration_payout_version VALUES(?,?,1,?,?,?)").run(MADEIRA_PILOT.cityId,revision,MADEIRA_PILOT.pubkey,"owner@example.org",JSON.stringify(signed));
  db.prepare("INSERT INTO payment_invoice VALUES('invoice',?,?)").run(MADEIRA_PILOT.cityId,revision);db.exec("INSERT INTO payment_invoice_payout VALUES('invoice',1)");
  const city={city:{cityId:MADEIRA_PILOT.cityId},event:{id:revision}};
  vi.mocked(queryPublishedCity).mockResolvedValue(city as never);
  vi.mocked(queryCityAuthorization).mockResolvedValue({grant:{creatorPubkey:MADEIRA_PILOT.pubkey},event:{id:authority}} as never);
  vi.mocked(proSetupDependencies.discover).mockResolvedValue(null);
  vi.mocked(proSetupDependencies.restrictions).mockResolvedValue(false);
  vi.mocked(proSetupDependencies.snapshot).mockResolvedValue({revisions:[],approvals:[]} as never);
  vi.mocked(managedCities).mockReturnValue([{state:"approved",revision:city,decision:{event:{id:approval}}}] as never);
});
afterEach(()=>db.close());
it("uses approved Madeira, verified existing creator and owner-signed checkout payout without a paid entitlement",async()=>{
  expect(await resolveMadeiraPilotSnapshot(db)).toEqual({revisionId:revision,approvalEventId:approval,authorityEventId:authority,payoutVersion:1,payoutDestination:"owner@example.org"});
  expect(validatePayoutDestination).toHaveBeenCalledWith("owner@example.org",{blockedDomains:["bitcoinwalk.org"]});
});
it("refuses absent approval, changed ownership, suspended publishing and directory outages",async()=>{
  vi.mocked(queryPublishedCity).mockResolvedValueOnce(null);await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("Approve Madeira");
  vi.mocked(proSetupDependencies.discover).mockResolvedValueOnce({ownerPubkey:"d".repeat(64),eventId:authority});await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("ownership changed");
  vi.mocked(proSetupDependencies.restrictions).mockResolvedValueOnce(true);await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("suspended");
  vi.mocked(proSetupDependencies.discover).mockRejectedValueOnce(new Error("offline"));await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("offline");
});
it("rejects changed payout, another city's invoice and unavailable destination",async()=>{
  vi.mocked(validatePayoutDestination).mockRejectedValueOnce(new Error("offline"));await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("offline");
  db.exec("UPDATE registration_payout_version SET normalized='attacker@example.org'");await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("signature is invalid");
  db.exec("UPDATE payment_invoice SET cityId='other-city'");await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("missing");
});
it("rejects a checkout signature intended for production",async()=>{
  const signed=finalizeEvent(paymentRequest({action:"create",cityId:MADEIRA_PILOT.cityId,revisionId:revision,payoutDestination:"owner@example.org"},"https://bitcoinwalk.org"),new Uint8Array(32).fill(2));
  db.prepare("UPDATE registration_payout_version SET owner_event=?").run(JSON.stringify(signed));
  await expect(resolveMadeiraPilotSnapshot(db)).rejects.toThrow("authorization required");
});
