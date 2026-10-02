import {readFile} from "node:fs/promises";
import {describe,expect,it} from "vitest";


describe("corrected reproducible staging release",()=>{
  it("packages only a browser bundle containing every required public relay",async()=>{
    const packager=await readFile("scripts/package-staging.mjs","utf8");

    for(const required of [
      "wss://relay-staging.bitcoinwalk.org/",
      "wss://directory-staging.bitcoinwalk.org/",
      "wss://directory-2-staging.bitcoinwalk.org/",
      "Required staging relay is absent from the browser bundle",
    ])expect(packager).toContain(required);
  });

  it("replaces rejected releases directly from known-good 0.3.70 with rollback",async()=>{
    const installer=await readFile("deploy/install-city-directory-failover-0.3.73.sh","utf8");

    for(const required of [
      "app-staging-0.3.73.tar.gz",
      "/opt/bitcoinwalk-app-staging/releases/0.3.70",
      "/opt/bitcoinwalk-app-staging/releases/0.3.73",
      "0.3.70 was restored",
      "wss://relay-staging.bitcoinwalk.org/",
      "wss://directory-staging.bitcoinwalk.org/",
      "wss://directory-2-staging.bitcoinwalk.org/",
    ])expect(installer).toContain(required);
  });
});

describe("directory outcome copy staging release",()=>{
  it("upgrades only the app from accepted 0.3.73 and can restore it",async()=>{
    const installer=await readFile("deploy/install-city-directory-outcome-copy-0.3.74.sh","utf8");

    for(const required of [
      "app-staging-0.3.74.tar.gz",
      "/opt/bitcoinwalk-app-staging/releases/0.3.73",
      "/opt/bitcoinwalk-app-staging/releases/0.3.74",
      "0.3.73 was restored",
      "Existing trust anchor verified",
      "Existing trust anchor recovered",
    ])expect(installer).toContain(required);

    for(const forbidden of [
      "systemctl restart bitcoinwalk-directory-staging",
      "docker restart",
      "/var/lib/bitcoinwalk-directory",
      "/etc/caddy/Caddyfile",
    ])expect(installer).not.toContain(forbidden);
  });
});

describe("directory successor signing staging release",()=>{
  it("upgrades only the app from accepted 0.3.74 with rollback and bundle checks",async()=>{
    const installer=await readFile("deploy/install-city-directory-successors-0.3.75.sh","utf8");

    for(const required of [
      "app-staging-0.3.75.tar.gz",
      "/opt/bitcoinwalk-app-staging/releases/0.3.74",
      "/opt/bitcoinwalk-app-staging/releases/0.3.75",
      "0.3.74 was restored",
      "Manage signed directory",
      "Review and sign successor",
      "all configured directory transports",
    ])expect(installer).toContain(required);

    for(const forbidden of [
      "systemctl restart bitcoinwalk-directory-staging",
      "docker restart",
      "/var/lib/bitcoinwalk-directory",
      "/etc/caddy/Caddyfile",
    ])expect(installer).not.toContain(forbidden);
  });
});
