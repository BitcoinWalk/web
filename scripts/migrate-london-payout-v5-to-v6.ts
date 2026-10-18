import {DatabaseSync} from "node:sqlite";
import {PayoutLedger} from "../src/rustress/payout-ledger";

const db=new DatabaseSync("/var/lib/bitcoinwalk-payout/ledger.sqlite");
try{
 const ledger=new PayoutLedger(db),cityId="ca2f9905-fb4d-4948-a12c-c792b28ec7c8",walletRef="bitcoinwalk-rustress";
 const source={cityId,walletRef,destinationVersion:5,destination:"denimpanther1@primal.net"};
 const target={cityId,walletRef,destinationVersion:6,destination:"bighot23@walletofsatoshi.com"};
 const result=ledger.migrate("94d6ea9c-d0d6-4dc8-84a4-22ea4a3ad908",source,target,"165900");
 const oldBalance=ledger.balance(source),newBalance=ledger.balance(target);
 if(oldBalance.availableMsat!=="0"||newBalance.availableMsat!=="166490"||result.amountMsat!=="165900")throw new Error();
 process.stdout.write("LONDON_PAYOUT_MIGRATION_RECORDED amountMsat=165900 sourceOutstandingMsat=0 targetAvailableMsat=166490\n");
}finally{db.close();}
