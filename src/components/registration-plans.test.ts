import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import RegistrationPlans,{registrationActionLabel} from "./registration-plans";

describe("RegistrationPlans",()=>{
  it("uses Submit for Basic and Next for Pro",()=>{
    expect(registrationActionLabel("free",false)).toBe("Submit");
    expect(registrationActionLabel("paid",false)).toBe("Next");
    expect(registrationActionLabel("paid",true)).toBe("Preparing…");
  });
  it("confirms the Basic plan without duplicating the step heading when Pro registration is disabled",()=>{
    const html=renderToStaticMarkup(createElement(RegistrationPlans,{value:"free",onChange:vi.fn(),disabled:false,paidEnabled:false,showHeading:false}));
    expect(html).toContain("Basic plan");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("Pro —");
  });

  it("leaves the plan choices visible without an inner heading on the dedicated plan step",()=>{
    const html=renderToStaticMarkup(createElement(RegistrationPlans,{value:"free",onChange:vi.fn(),disabled:false,paidEnabled:true,showHeading:false}));
    expect(html).toContain("Basic — 0 sats");
    expect(html).toContain("Pro — 21,000 sats once");
    expect(html).not.toContain("<h2");
    expect(html).toContain("See what you get in each tier");
    expect(html).toContain("Basic and Pro benefits");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("No recurring subscription");
    expect(html).not.toContain("NIP-05 identifies");
    expect(html).not.toContain("Node apps");
  });
});
