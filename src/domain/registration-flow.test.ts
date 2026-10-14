import {describe,expect,it} from "vitest";
import {registrationSubmissionMessage} from "./registration-flow";

describe("registrationSubmissionMessage",()=>{
  it("explains the one-pending-city organizer limit",()=>{
    expect(registrationSubmissionMessage(new Error("Published to 0/1 relays; rate-limited: this identity already has a city awaiting review"))).toBe("This host identity already has a city awaiting review. Complete that review in the dashboard or connect a different host identity before starting another city.");
  });
  it("explains the initial-walk limit without asking for another identity",()=>{
    expect(registrationSubmissionMessage(new Error("Published to 0/1 relays; rate-limited: initial walk submission limit"))).toBe("This host has reached the daily limit for new initial walk proposals. Wait up to 24 hours before trying again; do not create another identity or repeatedly resubmit.");
  });
  it("preserves other relay errors",()=>expect(registrationSubmissionMessage(new Error("relay unavailable"))).toBe("relay unavailable"));
});
