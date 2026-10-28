import {describe,expect,it} from "vitest";
import {registrationDashboardHref,registrationHandoffNextHref,setRegistrationHandoff,takeRegistrationHandoff} from "./registration-handoff";

describe("registration dashboard handoff",()=>{
  it("keeps sensitive state out of the URL and consumes the in-memory notice once",()=>{
    const value={cityId:"11111111-1111-4111-8111-111111111111",cityName:"Austin",tier:"paid" as const,paymentVerified:true};
    setRegistrationHandoff(value);
    expect(registrationDashboardHref(value.cityId)).toBe("/admin?submitted=11111111-1111-4111-8111-111111111111");
    expect(takeRegistrationHandoff()).toEqual(value);
    expect(takeRegistrationHandoff()).toBeNull();
  });
  it("sends a paid host straight to resumable Pro setup and a Basic host to the city request",()=>{
    const cityId="11111111-1111-4111-8111-111111111111";
    expect(registrationHandoffNextHref({cityId,cityName:"Austin",tier:"paid",paymentVerified:true})).toBe(`/admin/my-cities?city=${cityId}#pro-city-services`);
    expect(registrationHandoffNextHref({cityId,cityName:"Austin",tier:"free",paymentVerified:false})).toBe(`/admin/my-cities?city=${cityId}`);
  });
});
