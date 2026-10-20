import {describe,expect,it} from "vitest";
import fixtures from "./fixtures/chat-targets-v1.json";
import {parseChatPath,chatTargetPath,type ChatTarget} from "./chat-target";

describe("platform-independent chat target v1 fixtures",()=>{
  it.each(fixtures.cases)("parses and formats $path",row=>{
    expect(parseChatPath(row.path)).toEqual(row.intent);
    expect(chatTargetPath(row.target as ChatTarget,"madeira")).toBe(row.path);
  });
  it.each(fixtures.invalidPaths)("rejects malformed or authority-bearing path %s",path=>expect(parseChatPath(path)).toBeNull());
  it("does not interpolate arbitrary paths into a city link",()=>{
    for(const slug of ["../hosts","madeira?role=host","https://evil.example","madeira/hosts",""])
      expect(()=>chatTargetPath({version:1,kind:"city",cityId:"a"},slug)).toThrow();
  });
});
