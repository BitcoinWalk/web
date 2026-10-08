import {createHash,randomBytes,randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {openBackup,sealBackup} from "./backup-envelope";
import {PayoutLedger} from "./payout-ledger";
import {PayoutRecovery} from "./payout-recovery";

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true});});

describe("authenticated payout backups",()=>{
  it("restores independent encrypted ledger and journal without replay, then rolls back exactly",async()=>{
    const dir=mkdtempSync(join(tmpdir(),"bw-encrypted-restore-"));dirs.push(dir);
    const ledgerPath=join(dir,"ledger.sqlite"),journalPath=join(dir,"journal.sqlite");
    const ledgerKey=randomBytes(32),journalKey=randomBytes(32);
    const binding="ab".repeat(32),preimage="12".repeat(32);
    const paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
    const bucket={cityId:randomUUID(),walletRef:"fixture",destinationVersion:1,destination:"fixture@example.org"};
    const payoutId=randomUUID();
    let ledgerDb=new DatabaseSync(ledgerPath),journalDb=new DatabaseSync(journalPath),ledger=new PayoutLedger(ledgerDb);
    ledger.register({...bucket,paymentHash:"cd".repeat(32),amountMsat:"100000"});
    ledger.settle("fixture","cd".repeat(32),"100000");
    ledger.reserve(bucket,payoutId,paymentHash,"79000","10000","private fixture invoice");
    const history=vi.fn(async()=>({binding,complete:true,outgoingHashes:[] as string[]}));
    const lookup=vi.fn(async()=>({state:"paid" as const,walletRef:"fixture",paymentHash,amountMsat:"79000",feeMsat:"1000",preimage}));
    const guard=new PayoutRecovery(journalDb,ledger,"fixture",binding,history,lookup,()=>true);
    expect(await guard.reconcile()).toEqual({state:"reconciled"});
    expect(ledger.claimWithinBudget(payoutId,"fixture","100000")).toBe(true);
    expect(guard.claim(payoutId)).toBe(true);
    ledgerDb.close();journalDb.close();

    const ledgerPlain=readFileSync(ledgerPath),journalPlain=readFileSync(journalPath);
    const ledgerEnvelope=sealBackup(ledgerPlain,ledgerKey,"bitcoinwalk:ledger:v1");
    const journalEnvelope=sealBackup(journalPlain,journalKey,"bitcoinwalk:journal:v1");
    expect(ledgerEnvelope.includes(Buffer.from("private fixture invoice"))).toBe(false);
    expect(journalEnvelope.includes(Buffer.from(paymentHash))).toBe(false);
    expect(()=>openBackup(ledgerEnvelope,randomBytes(32),"bitcoinwalk:ledger:v1")).toThrow("Backup authentication failed");
    expect(()=>openBackup(ledgerEnvelope,ledgerKey,"bitcoinwalk:journal:v1")).toThrow("Backup authentication failed");
    const damaged=Buffer.from(journalEnvelope);damaged[damaged.length-1]^=1;
    expect(()=>openBackup(damaged,journalKey,"bitcoinwalk:journal:v1")).toThrow("Backup authentication failed");

    const restoredLedger=join(dir,"restored-ledger.sqlite"),restoredJournal=join(dir,"restored-journal.sqlite");
    writeFileSync(restoredLedger,openBackup(ledgerEnvelope,ledgerKey,"bitcoinwalk:ledger:v1"),{mode:0o600});
    writeFileSync(restoredJournal,openBackup(journalEnvelope,journalKey,"bitcoinwalk:journal:v1"),{mode:0o600});
    ledgerDb=new DatabaseSync(restoredLedger);journalDb=new DatabaseSync(restoredJournal);ledger=new PayoutLedger(ledgerDb);
    history.mockResolvedValue({binding,complete:true,outgoingHashes:[paymentHash]});
    const restored=new PayoutRecovery(journalDb,ledger,"fixture",binding,history,lookup,()=>true);
    expect(await restored.reconcile()).toEqual({state:"reconciled"});
    expect(ledger.status(payoutId)?.state).toBe("paid");
    expect(ledger.claimWithinBudget(payoutId,"fixture","100000")).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(1);
    ledgerDb.close();journalDb.close();

    const migrated=sealBackup(readFileSync(restoredLedger),ledgerKey,"bitcoinwalk:ledger:v1");
    expect(openBackup(migrated,ledgerKey,"bitcoinwalk:ledger:v1").equals(readFileSync(restoredLedger))).toBe(true);
    expect(openBackup(ledgerEnvelope,ledgerKey,"bitcoinwalk:ledger:v1").equals(ledgerPlain)).toBe(true);
    expect(openBackup(journalEnvelope,journalKey,"bitcoinwalk:journal:v1").equals(journalPlain)).toBe(true);
  });
});
