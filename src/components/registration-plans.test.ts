import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import RegistrationPlans from "./registration-plans";

describe("RegistrationPlans",()=>{
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
  });

  it("places the Pro checkout directly below the tier choices",()=>{
    const html=renderToStaticMarkup(createElement(RegistrationPlans,{value:"paid",onChange:vi.fn(),disabled:false,paidEnabled:true,showHeading:false,paidCheckout:createElement("div",{"data-testid":"checkout"},"Invoice QR")}));
    expect(html).toContain("Invoice QR");
    expect(html.indexOf("</fieldset>")).toBeLessThan(html.indexOf("Invoice QR"));
    expect(html.indexOf("Invoice QR")).toBeLessThan(html.indexOf("No recurring subscription"));
    expect(html).not.toContain("Paid activation is not connected yet");
  });
});
