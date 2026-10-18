import {describe,expect,it} from "vitest";
import {responseJSON} from "./response-json";

describe("responseJSON",()=>{
  it("returns a complete JSON response",async()=>{await expect(responseJSON<{ok:boolean}>(new Response('{"ok":true}'))).resolves.toEqual({ok:true});});
  it.each(["","  ","<html>gateway unavailable</html>"])("turns an interrupted response into retry-safe guidance",async body=>{
    await expect(responseJSON(new Response(body,{status:502}))).rejects.toThrow("Retry safely; no identity, payment or payout was changed");
  });
});
