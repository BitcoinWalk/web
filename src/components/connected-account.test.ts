import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import ConnectedAccount from "./connected-account";

vi.mock("./nostr-user",()=>({default:({pubkey,variant,showLightning}:{pubkey:string;variant:string;showLightning:boolean})=>createElement("div",{"data-pubkey":pubkey,"data-variant":variant,"data-lightning":String(showLightning)},"Resolved profile")}));

describe("connected account",()=>{
 it("uses the shared resolving profile component for the exact connected key",()=>{
  const html=renderToStaticMarkup(createElement(ConnectedAccount,{pubkey:"a".repeat(64),disabled:false,onDisconnect:vi.fn()}));
  expect(html).toContain(`data-pubkey="${"a".repeat(64)}"`);
  expect(html).toContain('data-variant="compact"');
  expect(html).toContain('data-lightning="false"');
  expect(html).not.toContain("Account connected");
  expect(html).toContain("Use another account");
 });
 it("prevents account switching while an operation is busy",()=>{
  const html=renderToStaticMarkup(createElement(ConnectedAccount,{pubkey:"b".repeat(64),disabled:true,onDisconnect:vi.fn()}));
  expect(html).toContain('disabled=""');
 });
});
