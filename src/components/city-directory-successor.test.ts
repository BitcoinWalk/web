import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import type {CityDirectoryState} from "../nostr/city-directory";
import CityDirectorySuccessor,{availableDirectoryActions} from "./city-directory-successor";

const owner="1".repeat(64),operator="2".repeat(64),recovery="3".repeat(64);
const state={content:{ownerPubkey:owner,operatorPubkeys:[operator],recoveryPubkeys:[recovery]}} as CityDirectoryState;

describe("directory successor management",()=>{
  it("requires an explicit trust anchor before loading a signed chain",()=>{
    const html=renderToStaticMarkup(createElement(CityDirectorySuccessor));
    expect(html).toContain("Manage signed directory");
    expect(html).toContain("Trust anchor event ID");
    expect(html).toContain("Initial owner npub");
    expect(html).toContain("Load signed chain");
  });

  it("exposes only the transitions authorized for the connected signer",()=>{
    expect(availableDirectoryActions(state,owner)).toEqual(["owner-update","rotate"]);
    expect(availableDirectoryActions(state,operator)).toEqual(["operator-update"]);
    expect(availableDirectoryActions(state,recovery)).toEqual(["recover"]);
    expect(availableDirectoryActions(state,"4".repeat(64))).toEqual([]);
  });
});
