import type {PaymentView} from "./service";

export function paidPaymentForCity(payments:PaymentView[],cityId:string):PaymentView|undefined{
 return payments.find(payment=>payment.cityId===cityId&&payment.tier==="paid"&&payment.status==="paid");
}
