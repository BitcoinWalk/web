export async function register(){
 if(process.env.NEXT_RUNTIME==="nodejs"){
  const {startPaymentRuntime}=await import("./payments/runtime");
  startPaymentRuntime();
 }
}

