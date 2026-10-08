import {PrivateNwcTransport} from "./nwc-transport";
/** Read-only public surface; private transport cannot be invoked by callers. */
export class RustressNwcReader {
 #transport:PrivateNwcTransport;
 readonly binding:string;
 constructor(readonly walletRef:string,value:string,checkoutValue:string){
  this.#transport=new PrivateNwcTransport(walletRef,value,checkoutValue);this.binding=this.#transport.binding;
 }
 getInfo(){return this.#transport.getInfo();}
 lookupInvoice(hash:string){return this.#transport.lookupInvoice(hash);}
 lookupPayout(hash:string){return this.#transport.lookupPayout(hash);}
 listTransactions(offset=0,limit=50){return this.#transport.listTransactions(offset,limit);}
 listRecoveryTransactions(offset=0,limit=50){return this.#transport.listRecoveryTransactions(offset,limit);}
}
