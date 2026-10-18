const interruptedMessage="BitcoinWalk did not return a complete response. Retry safely; no identity, payment or payout was changed.";

export async function responseJSON<T>(response:Response):Promise<T>{
  const text=await response.text();
  if(!text.trim())throw new Error(interruptedMessage);
  try{return JSON.parse(text) as T;}
  catch{throw new Error(interruptedMessage);}
}
