import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import EditorsScreen from "./_screen";
import {readFileSync} from "node:fs";

describe("city editor selection",()=>{
 it("uses the reusable searchable city finder",()=>{
  const html=renderToStaticMarkup(createElement(EditorsScreen));
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Search cities to manage editors…");
  expect(html).not.toContain("<select");
 });
 it("offers a request-only queue without manual permission forms or a misleading empty state before loading",()=>{
  const html=renderToStaticMarkup(createElement(EditorsScreen,{requestsOnly:true}));
  expect(html).toContain("City editor requests");
  expect(html).toContain("a removal request does not revoke access yet");
  expect(html).not.toContain('role="combobox"');
  expect(html).not.toContain("New editor npub");
  expect(html).not.toContain("No city editor requests need approval");
 });
 it("uses the same guarded handler for both queues and shows owner and target identities",()=>{
  const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
  expect(source).toContain("requestsOnly||!dashboard.selectedCity");
  expect(source).toContain("pendingCityEditorRequests(editorRequests,cities)");
  expect(source).toContain("Requested by owner:");
  expect(source).toContain("nip19.npubEncode(row.event.pubkey)");
  expect(source).toContain("nip19.npubEncode(row.request.editorPubkey)");
  expect(source).toContain("change(row.request.action,row.request.editorPubkey,ownerRecord)");
  expect(source.match(/assertGrantUnchanged\(targetRecord/g)).toHaveLength(2);
  expect(source).toContain("current.event.id!==signed.id");
  expect(source).toContain("setRequests(items=>items.filter(item=>item.request.cityId!==cityId))");
 });
});
