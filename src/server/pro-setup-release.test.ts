import {readFileSync} from "node:fs";
import {expect,it} from "vitest";

it("ships an exact-hash, additive production repair for the promoted Graz artwork",()=>{
  const script=readFileSync("deploy/repair-production-pro-setup-0.3.301.sh","utf8");
  for(const value of [
    "Run with sudo.",
    "app-production-0.3.301.tar.gz",
    "7d03cb20c151f7db6eca2d8db49c2bea00f0dd5f50560f4610f84c0563b10e1f",
    "sha256sum \"$source_file\"",
    "install -o bitcoinwalk -g bitcoinwalk -m 0600",
    "runuser -u bitcoinwalk",
    "app-production-0.3.301",
    "no signed city, payment, identity or payout record was changed",
  ])expect(script).toContain(value);
  expect(script).not.toContain("payments.sqlite");
});
