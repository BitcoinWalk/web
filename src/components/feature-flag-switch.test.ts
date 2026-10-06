import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import {FeatureFlagSwitch} from "./feature-flag-switch";

describe("FeatureFlagSwitch",()=>{
  it("exposes an explicit accessible ON state",()=>{
    const html=renderToStaticMarkup(createElement(FeatureFlagSwitch,{checked:true,label:"Sponsor Invite",onChange:vi.fn()}));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Sponsor Invite"');
    expect(html).toContain(">ON<");
  });

  it("exposes an explicit OFF state",()=>{
    const html=renderToStaticMarkup(createElement(FeatureFlagSwitch,{checked:false,label:"Sponsor Invite",onChange:vi.fn()}));
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain(">OFF<");
  });
});
