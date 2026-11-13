import {describe,expect,it} from "vitest";
import {allTrailsRoute,optionalAllTrailsRoute} from "./walk-route";

describe("AllTrails walk routes",()=>{
 it("preserves the Madeira custom-route share link without inventing a trail widget",()=>{
  const url="https://www.alltrails.com/explore/custom-routes/custom-route-camacha-levada-dos-tornos-48092f7?u=m&sh=vmjvek";
  expect(allTrailsRoute(url)).toEqual({url,embedUrl:null});
  expect(optionalAllTrailsRoute(url)).toBe(url);
 });
 it("rejects unsafe or incomplete custom-route URLs",()=>{
  for(const url of ["http://www.alltrails.com/explore/custom-routes/test","https://www.alltrails.com.evil.test/explore/custom-routes/test","https://user:secret@www.alltrails.com/explore/custom-routes/test","https://www.alltrails.com:8443/explore/custom-routes/test","https://www.alltrails.com/explore/custom-routes/","https://www.alltrails.com/explore/custom-routes/test/other"]){expect(()=>allTrailsRoute(url)).toThrow();}
 });
 it("normalizes the Madeira share URL into a safe widget",()=>{expect(allTrailsRoute("https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas?u=m&sh=vmjvek")).toEqual({url:"https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas?u=m&sh=vmjvek",embedUrl:"https://www.alltrails.com/widget/trail/portugal/madeira--2/levada-das-rabacas?u=m&sh=vmjvek"});});
 it("accepts official widget URLs but stores the portable share URL",()=>{expect(allTrailsRoute("https://www.alltrails.com/widget/trail/portugal/madeira--2/levada-das-rabacas")?.url).toBe("https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas");});
 it("rejects lookalikes, insecure links and unrelated AllTrails pages",()=>{for(const value of ["http://www.alltrails.com/explore/trail/a/b","https://alltrails.example/explore/trail/a/b","https://www.alltrails.com/account"]){expect(()=>allTrailsRoute(value)).toThrow();}});
 it("keeps an empty route optional",()=>expect(optionalAllTrailsRoute(" ")).toBeUndefined());
});
