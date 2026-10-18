import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("city community administration", () => {
  it("provisions every approved city with exact identity and founding members", () => {
    const page = readFileSync(
        "src/app/admin/monitoring/chats/page.tsx",
        "utf8",
      ),
      layout = readFileSync("src/app/admin/monitoring/layout.tsx", "utf8");
    expect(layout).toContain('href="/admin/monitoring/chats"');
    expect(page).toContain("All city communities");
    expect(page).toContain("Every approved Basic and Pro city gets its own NIP-29 Walkie Talkie group");
    expect(page).toContain("cities.map(city=>");
    expect(page).not.toContain("paidCities");
    expect(page).toContain('tone:"neutral",label:"Not set up"');
    expect(page).toContain('tone:"red",label:"Needs attention"');
    expect(page).toContain("red is reserved for a channel that needs intervention");
    expect(page).toContain("Select all shown");
    expect(page).toContain("All statuses ({cities.length})");
    expect(page).toContain("Sign and provision ${selectedCityIds.length} selected");
    expect(page).toContain("completed cities turn green and leave the selection");
    expect(page).toContain("retry to continue with those still selected");
    expect(page).toContain("data-selected={checked?");
    expect(page).toContain("disabled={busy||isActive}");
    expect(page).toContain("<CityFinder");
    expect(page).toContain("Search all approved cities…");
    expect(page).toContain('"Pro":"Basic"} · shared Walkie Talkie');
    expect(page).toContain("wss://chat.bitcoinwalk.org/");
    expect(page).toContain(
      "Pro-city Armada and Concord routing remains on the city relay.",
    );
    expect(page).toContain("Sign and create complete group");
    expect(page).toContain("Sign and reconcile founding setup");
    expect(page).toContain("Sign and verify group");
    expect(page).toContain("Sign and activate community");
    expect(page).toContain("kind:9002");
    expect(page).toContain("kind:9000");
    expect(page).toContain('["picture",city.avatarUrl]');
    expect(page).toContain("city.organizerPubkey,city.guidePubkey");
    expect(page).toContain('"#h":["bitcoinwalk-authentication-probe"]');
    expect(page).toContain('reason.startsWith("auth-required:")');
    expect(page).toContain(
      "await target.auth(authenticateWithBrowserExtension)",
    );
    expect(page).toContain("target.subscribe([{kinds:[39002]");
    expect(page).toContain("city.organizerPubkey,city.guidePubkey");
    expect(page).toContain("pubkey!==actor");
    expect(page).toContain(
      "does not include the group creator and administrator",
    );
    expect(page).toContain("!await groupExists(relay,id)");
    expect(page).toContain("Waiting for signature…");
    expect(page).toContain("Approve the activation request in your signer.");
    expect(page).toContain(
      'const mayVerify=!current||current.phase==="candidate"||current.phase==="needs-attention"',
    );
    expect(page).toContain("Group created and verified.");
    expect(page).toContain("Setup complete.");
    expect(page).toContain("Open Walkie Talkie channel ↗");
    expect(page).toContain(
      "https://chat.bitcoinwalk.org/${encodeURIComponent(current.slug)}",
    );
    expect(page).toContain('action.action==="list"');
    expect(page).toContain("returned no response");
    expect(page).not.toContain("body=await response.json()");
    expect(page).not.toContain("Open Armada ↗");
    expect(page).not.toContain("private key");
    expect(page).not.toContain("chat-${selected.slug}");
  });
  it("moves organizer-room ownership to the Hosts module", () => {
    const page = readFileSync(
      "src/app/admin/monitoring/chats/page.tsx",
      "utf8",
    );
    expect(page).toContain("Hosts → Organizer chat");
    expect(page).toContain("/admin/organizers?tab=chat");
    expect(page).not.toContain("Sign and reconcile organizer room");
    expect(page).not.toContain("organizerRoomRosterPlan");
  });
});
