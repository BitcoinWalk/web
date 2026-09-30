export const dynamic="force-dynamic";
export function GET(){return Response.json({status:"ok",app:"bitcoinwalk-web",release:"app-staging-0.3.99"},{headers:{"Cache-Control":"no-store"}});}
