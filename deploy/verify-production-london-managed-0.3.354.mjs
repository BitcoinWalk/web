import {DatabaseSync} from "node:sqlite";

const city="ca2f9905-fb4d-4948-a12c-c792b28ec7c8";
const pubkey="4ba507c530274e2799a1d25d2411937e07a3a38189b536290ef653251bd4255d";
const db=new DatabaseSync("/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite",{readOnly:true});
try{
  const row=db.prepare("SELECT activation_config,phase,nip05,lnurl FROM rustress_activation_task WHERE city=?").get(city);
  if(!row)throw new Error("London managed activation is missing");
  const config=JSON.parse(row.activation_config);
  if(config.cityId!==city||config.domain!=="bitcoinwalk.org"||config.localPart!=="london"||config.brandPubkey!==pubkey||
    config.walletRef!=="bitcoinwalk-rustress"||config.organizerBasisPoints!==7900||config.retainedBasisPoints!==2100||
    config.invoiceIssuance!=="enabled"||!Number.isSafeInteger(config.payoutVersion)||config.payoutVersion<1)
    throw new Error("London managed activation does not match the approved public identity and 79/21 policy");
  if(!["verifying","needs-attention","active"].includes(row.phase)||row.nip05!=="active")
    throw new Error("London NIP-05 has not been independently verified");
  process.stdout.write(JSON.stringify({cityId:city,localPart:config.localPart,brandPubkey:config.brandPubkey,payoutVersion:config.payoutVersion,
    organizerBasisPoints:config.organizerBasisPoints,retainedBasisPoints:config.retainedBasisPoints,invoiceIssuance:config.invoiceIssuance,
    phase:row.phase,nip05:row.nip05,lnurl:row.lnurl})+"\n");
}finally{db.close();}
