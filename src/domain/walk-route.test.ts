import {describe,expect,it} from "vitest";
import {allTrailsRoute,optionalAllTrailsRoute} from "./walk-route";

describe("AllTrails walk routes",()=>{
 it("normalizes the Madeira share URL into a safe widget",()=>{expect(allTrailsRoute("https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas?u=m&sh=vmjvek")).toEqual({url:"https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas?u=m&sh=vmjvek",embedUrl:"https://www.alltrails.com/widget/trail/portugal/madeira--2/levada-das-rabacas?u=m&sh=vmjvek"});});
 it("accepts official widget URLs but stores the portable share URL",()=>{expect(allTrailsRoute("https://www.alltrails.com/widget/trail/portugal/madeira--2/levada-das-rabacas")?.url).toBe("https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas");});
 it("rejects lookalikes, insecure links and unrelated AllTrails pages",()=>{for(const value of ["http://www.alltrails.com/explore/trail/a/b","https://alltrails.example/explore/trail/a/b","https://www.alltrails.com/account"]){expect(()=>allTrailsRoute(value)).toThrow();}});
 it("keeps an empty route optional",()=>expect(optionalAllTrailsRoute(" ")).toBeUndefined());
});
