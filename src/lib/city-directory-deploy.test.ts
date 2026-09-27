import {readFile} from "node:fs/promises";
import {describe,expect,it} from "vitest";

describe("first-party directory staging installer",()=>{
  it("backs up and rolls back the app service while activating only release 0.3.71",async()=>{
    const installer=await readFile("deploy/install-city-directory-first-party-0.3.71.sh","utf8");

    for(const required of [
      "mktemp -d /var/backups/bitcoinwalk-city-directory-first-party.",
      "app-staging-0.3.71.tar.gz",
      "/opt/bitcoinwalk-app-staging/releases/0.3.70",
      "/opt/bitcoinwalk-app-staging/releases/0.3.71",
      "service.before",
      "0.3.70 was restored",
    ])expect(installer).toContain(required);
  });

  it("requires both BitcoinWalk discovery transports in the staged browser bundle",async()=>{
    const installer=await readFile("deploy/install-city-directory-first-party-0.3.71.sh","utf8");

    expect(installer).toContain("wss://directory-staging.bitcoinwalk.org/");
    expect(installer).toContain("wss://directory-2-staging.bitcoinwalk.org/");
    expect(installer).toContain("grep -Rqs");
  });

  it("does not mutate directory, relay, Guide, DNS or Caddy state",async()=>{
    const installer=await readFile("deploy/install-city-directory-first-party-0.3.71.sh","utf8");

    for(const forbidden of [
      "systemctl restart bitcoinwalk-guide",
      "systemctl restart bitcoinwalk-relay",
      "/etc/caddy/Caddyfile",
      "/var/lib/bitcoinwalk-directory",
      "docker restart",
    ])expect(installer).not.toContain(forbidden);
  });
});

describe("directory failover staging installer",()=>{
  it("activates only app 0.3.72 from the accepted 0.3.71 release with rollback",async()=>{
    const installer=await readFile("deploy/install-city-directory-failover-0.3.72.sh","utf8");

    for(const required of [
      "mktemp -d /var/backups/bitcoinwalk-city-directory-failover.",
      "app-staging-0.3.72.tar.gz",
      "/opt/bitcoinwalk-app-staging/releases/0.3.71",
      "/opt/bitcoinwalk-app-staging/releases/0.3.72",
      "0.3.71 was restored",
      "wss://directory-staging.bitcoinwalk.org/",
      "wss://directory-2-staging.bitcoinwalk.org/",
    ])expect(installer).toContain(required);
  });

  it("does not restart or mutate either directory transport",async()=>{
    const installer=await readFile("deploy/install-city-directory-failover-0.3.72.sh","utf8");

    for(const forbidden of [
      "systemctl restart bitcoinwalk-directory-staging",
      "docker restart",
      "/var/lib/bitcoinwalk-directory",
      "/etc/caddy/Caddyfile",
    ])expect(installer).not.toContain(forbidden);
  });
});
