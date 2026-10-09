export const dynamic="force-dynamic";
export const defaultRelease="app-staging-0.3.199";
export function GET(){return Response.json({status:"ok",app:"bitcoinwalk-web",release:process.env.BITCOINWALK_APP_RELEASE?.trim()||defaultRelease},{headers:{"Cache-Control":"no-store"}});}
