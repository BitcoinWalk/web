import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("administrative Pro promotion operator",()=>{
 it("reads signed city workflow evidence from the application relays",()=>{
  const script=readFileSync("scripts/promote-basic-city-to-pro.ts","utf8");
  expect(script).toContain('relays:["wss://relay-staging.bitcoinwalk.org/"]');
  expect(script).toContain('relays:["wss://relay.bitcoinwalk.org/"]');
  expect(script).not.toContain('relays:["wss://directory-staging.bitcoinwalk.org/"');
  expect(script).not.toContain('relays:["wss://directory.bitcoinwalk.org/"');
 });
});
