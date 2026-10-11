import {createPublicZapInvoice,PublicZapInvoiceError} from "../../../../server/public-zap-invoice";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"};

export async function POST(request:Request){
 try{
  const length=Number(request.headers.get("content-length")??0);if(length>65_536)return Response.json({error:"Request too large."},{status:413,headers});
  const body=await request.json() as {address?:unknown;amountMsat?:unknown;zapRequest?:unknown};
  if(typeof body.address!=="string"||typeof body.zapRequest!=="string")throw new PublicZapInvoiceError("The zap request is invalid.");
  return Response.json(await createPublicZapInvoice({address:body.address,amountMsat:Number(body.amountMsat),zapRequest:body.zapRequest}),{headers});
 }catch(error){const known=error instanceof PublicZapInvoiceError;return Response.json({error:known?error.message:"The zap invoice could not be created."},{status:known?error.status:400,headers});}
}
