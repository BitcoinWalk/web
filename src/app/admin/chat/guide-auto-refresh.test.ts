import {afterEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {startGuideAutoRefresh} from "./guide-auto-refresh";

afterEach(()=>vi.useRealTimers());
it("refreshes every five seconds only while visible and stops on cleanup",()=>{
 vi.useFakeTimers();
 const refresh=vi.fn(),listeners=new Set<()=>void>();
 const page={hidden:false,addEventListener:(_name:string,fn:EventListenerOrEventListenerObject)=>listeners.add(fn as ()=>void),removeEventListener:(_name:string,fn:EventListenerOrEventListenerObject)=>listeners.delete(fn as ()=>void)};
 const stop=startGuideAutoRefresh(refresh,page);
 vi.advanceTimersByTime(4999);expect(refresh).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(refresh).toHaveBeenCalledTimes(1);
 page.hidden=true;vi.advanceTimersByTime(10000);expect(refresh).toHaveBeenCalledTimes(1);
 page.hidden=false;listeners.forEach(fn=>fn());expect(refresh).toHaveBeenCalledTimes(2);
 stop();vi.advanceTimersByTime(10000);expect(refresh).toHaveBeenCalledTimes(2);expect(listeners.size).toBe(0);
});
it("only polls the signed-in Guide conversation after a successful read and never overlaps reads",()=>{
 const source=readFileSync("src/app/admin/chat/page.tsx","utf8");
 expect(source).toContain('if(!guideSelected||!dashboard.pubkey||!guidePubkey)return');
 expect(source).toContain('if(guideRead.current!==null||(background&&!guidePollingReady.current))return');
 expect(source.indexOf('guideRead.current=request')).toBeLessThan(source.indexOf('await discoverInbox(dashboard.pubkey)'));
 expect(source).toContain('if(guideRead.current===request)guideRead.current=null');
 const loadGuide=source.slice(source.indexOf('const loadGuide=useCallback'),source.indexOf('const openRoom=useCallback'));
 expect(loadGuide).not.toContain('guidePollingReady.current=false');
 expect(source).toContain('(guideSelected||membership!=="not-joined")');
 expect(source).toContain('return startGuideAutoRefresh(()=>{void loadGuide(true);})');
});
