import {relayConfig} from "./relay-config";

/** Server-side reads can use the relay's loopback listener without consuming
 * the public IP's WebSocket connection budget. Never send this URL to clients. */
export function serverReadRelays():string[] {
  const internal=process.env.BITCOINWALK_SERVER_READ_RELAY;
  if(!internal)return relayConfig.readRelays;
  const url=new URL(internal);
  if(url.protocol!=="ws:" || url.hostname!=="127.0.0.1" || !url.port || url.pathname!=="/" || url.search || url.hash || url.username || url.password){
    throw new Error("BITCOINWALK_SERVER_READ_RELAY must be a loopback ws://127.0.0.1:<port> URL.");
  }
  return [url.href];
}

/** Map only the configured primary directory transport to its reviewed local
 * listener. The public WSS URLs remain the logical transport identities used
 * for quorum, signed records and every browser-facing configuration. */
export function serverDirectoryReadRelay(relay:string):string{
  const internal=process.env.BITCOINWALK_SERVER_DIRECTORY_READ_RELAY;
  if(!internal||relay!==relayConfig.directoryRelays[0])return relay;
  const url=new URL(internal);
  if(url.href!=="ws://127.0.0.1:3343/")throw new Error("BITCOINWALK_SERVER_DIRECTORY_READ_RELAY must be the reviewed primary directory loopback URL.");
  return url.href;
}
