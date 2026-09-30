import {describe,expect,it} from "vitest";
import {registrationSubmissionMessage} from "./registration-flow";

describe("registrationSubmissionMessage",()=>{
  it("explains the one-pending-city organizer limit",()=>{
    expect(registrationSubmissionMessage(new Error("Published to 0/1 relays; rate-limited: this identity already has a city awaiting review"))).toBe("This organizer identity already has a city awaiting review. Complete that review in the dashboard or connect a different organizer identity before starting another city.");
  });
  it("preserves other relay errors",()=>expect(registrationSubmissionMessage(new Error("relay unavailable"))).toBe("relay unavailable"));
});
