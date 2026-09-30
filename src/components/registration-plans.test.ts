import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import RegistrationPlans from "./registration-plans";

describe("RegistrationPlans",()=>{
  it("confirms the Free plan without duplicating the step heading when paid registration is disabled",()=>{
    const html=renderToStaticMarkup(createElement(RegistrationPlans,{value:"free",onChange:vi.fn(),disabled:false,paidEnabled:false,showHeading:false}));
    expect(html).toContain("Free plan");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("Paid —");
  });

  it("leaves the plan choices visible without an inner heading on the dedicated plan step",()=>{
    const html=renderToStaticMarkup(createElement(RegistrationPlans,{value:"free",onChange:vi.fn(),disabled:false,paidEnabled:true,showHeading:false}));
    expect(html).toContain("Free — 0 sats");
    expect(html).toContain("Paid — 21,000 sats once");
    expect(html).not.toContain("<h2");
  });
});
