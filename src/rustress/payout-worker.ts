import {PayoutLedger,type PayoutBucket} from "./payout-ledger";
import {validateOutgoingInvoice,type OutgoingTerms} from "./outgoing-invoice";

export type PayoutWallet={
  walletRef:string;network:OutgoingTerms["network"];
  /** Adapter MUST enforce the fee cap. A returned response is not settlement. */
  send(input:{invoice:string;maximumFeeMsat:string;paymentHash:string}):Promise<void>;
  lookup(paymentHash:string):Promise<{state:"pending"|"not-found"|"failed"}|{
    state:"paid";walletRef:string;paymentHash:string;amountMsat:string;feeMsat:string;preimage:string;
  }>;
};
type Authorization={bucket:PayoutBucket;paymentHash:string;amountMsat:string;maximumFeeMsat:string};

/** Dependency-injected fixture worker; no real wallet implementation or runtime hook.
 * Authorization must be fresh trusted server evidence (budget, fee enforcement,
 * network and exact connection), not a browser flag or wallet advertisement. */
export class PayoutWorker {
  constructor(private ledger:PayoutLedger,private wallet:PayoutWallet,
    private authorize:(request:Authorization)=>Promise<boolean>,private now=()=>Math.floor(Date.now()/1000),
    private claim=(id:string)=>ledger.claimSend(id)){}
  prepare(bucket:PayoutBucket,id:string,invoice:string,terms:OutgoingTerms,maximumFeeMsat:string){
    const checked=validateOutgoingInvoice(invoice,terms,this.now());
    if(bucket.walletRef!==this.wallet.walletRef||terms.network!==this.wallet.network)throw new Error("Payout wallet mismatch");
    this.ledger.reserve(bucket,id,checked.paymentHash,checked.amountMsat,maximumFeeMsat,JSON.stringify({invoice:checked.paymentRequest,terms:checked.terms}));
    return this.ledger.status(id);
  }
  async run(id:string){
    const row=this.ledger.workerInput(id);
    if(!row)return null;
    if(row.state==="paid"||row.state==="cancelled")return this.ledger.status(id);
    if(row.bucket.walletRef!==this.wallet.walletRef||!row.document)return this.ledger.status(id);
    try{
      const document=JSON.parse(row.document);
      // Reconcile already-claimed attempts even when their invoice has expired.
      const checked=validateOutgoingInvoice(document.invoice,document.terms,this.now(),true);
      if(checked.paymentHash!==row.hash||checked.amountMsat!==row.amount||checked.terms.network!==this.wallet.network)throw new Error();
      if(row.state==="prepared"){
        if(!await this.authorize({bucket:row.bucket,paymentHash:row.hash,amountMsat:row.amount,maximumFeeMsat:row.fee_cap}))return this.ledger.status(id);
        // The authorization call may have taken time: validate expiry again.
        validateOutgoingInvoice(document.invoice,document.terms,this.now());
        if(this.claim(id)){
          try{await this.wallet.send({invoice:checked.paymentRequest,maximumFeeMsat:row.fee_cap,paymentHash:row.hash});}
          catch{/* Timeout/rejection is not proof of non-payment. Lookup only. */}
        }
      }
      if(this.ledger.status(id)?.state!=="unknown")return this.ledger.status(id);
      const result=await this.wallet.lookup(row.hash);
      if(result.state==="paid")this.ledger.confirmPaid(id,result.walletRef,result.paymentHash,result.amountMsat,result.feeMsat,result.preimage);
      // Missing/failed/pending results cannot release credit or cause a resend.
    }catch{/* Never persist or expose wallet errors, invoices or preimages. */}
    return this.ledger.status(id);
  }
}
