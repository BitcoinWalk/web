import {DatabaseSync} from "node:sqlite";
import {it,expect,vi} from "vitest";
import {PayoutLedger} from "./payout-ledger";
import {createRecoveryController} from "./recovery-controller";
it("the composed recovery gate rejects ephemeral storage before any wallet read",async()=>{
 const local=new DatabaseSync(":memory:"),journal=new DatabaseSync(":memory:");
 try{
  const ledger=new PayoutLedger(local),reader={walletRef:"fixture",binding:"ab".repeat(32),listRecoveryTransactions:vi.fn(),lookupPayout:vi.fn()},coverage=vi.fn();
  const gate=createRecoveryController(ledger,journal,reader,coverage);
  expect(await gate.reconcile()).toEqual({state:"blocked"});expect(gate.ready).toBe(false);
  expect(coverage).not.toHaveBeenCalled();expect(reader.listRecoveryTransactions).not.toHaveBeenCalled();
 }finally{local.close();journal.close();}
});
