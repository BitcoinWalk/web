import {readFile} from "node:fs/promises";
import {describe,expect,it} from "vitest";


describe("reproducible environment-specific releases",()=>{
  it("requires every public relay for both staging and production bundles",async()=>{
    const packager=await readFile("scripts/package-staging.mjs","utf8");

    for(const required of [
      "wss://relay-staging.bitcoinwalk.org/",
      "wss://directory-staging.bitcoinwalk.org/",
      "wss://directory-2-staging.bitcoinwalk.org/",
      "wss://relay.bitcoinwalk.org/",
      "wss://directory.bitcoinwalk.org/",
      "wss://directory-2.bitcoinwalk.org/",
      "Required ${profile} relay is absent from the browser bundle",
    ])expect(packager).toContain(required);
  });

  it("runs production privately as bitcoinwalk with isolated state",async()=>{
    const [service,bootstrap,deployer]=await Promise.all([
      readFile("deploy/bitcoinwalk-app-production.user.service","utf8"),
      readFile("deploy/bootstrap-production-app-user.sh","utf8"),
      readFile("deploy/deploy-production-app-user.sh","utf8"),
    ]);
    for(const required of [
      "systemctl --user",
      "127.0.0.1:3345",
      "/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite",
      "https://bitcoinwalk.org",
    ])expect(`${service}\n${bootstrap}\n${deployer}`).toContain(required);
    expect(`${service}\n${bootstrap}\n${deployer}`).not.toContain("sudo ");
    expect(deployer).toContain("app-production-*.tar.gz");
    expect(bootstrap).toContain("backup-sqlite-online.mjs");
  });

  it("preserves legacy signed media while routing the canonical production host",async()=>{
    const [caddy,installer]=await Promise.all([
      readFile("deploy/Caddyfile.production-web","utf8"),
      readFile("deploy/install-production-web-caddy-0.3.189.sh","utf8"),
    ]);
    for(const required of ["directory.bitcoinwalk.org","bitcoinwalk.org, www.bitcoinwalk.org","handle /wp-content/*","127.0.0.1:3345","213.232.235.240"]){
      expect(caddy).toContain(required);
    }
    expect(installer).toContain("caddy validate");
    expect(installer).toContain("No DNS record was changed");
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
