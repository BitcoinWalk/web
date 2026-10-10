import {describe,expect,it} from "vitest";
import {metadata as publicMetadata} from "./layout";
import {metadata as adminMetadata} from "./admin/layout";

describe("BitcoinWalk favicons",()=>{
  it("uses the legacy orange WordPress icon on public pages",()=>{
    expect(JSON.stringify(publicMetadata.icons)).toContain("/brand/bitcoinwalk-favicon.png");
  });

  it("overrides the admin area with the purple icon",()=>{
    expect(JSON.stringify(adminMetadata.icons)).toContain("/brand/bitcoinwalk-admin-favicon.png");
    expect(JSON.stringify(adminMetadata.icons)).not.toContain("/brand/bitcoinwalk-favicon.png");
  });
});
