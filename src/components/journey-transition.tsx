"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ViewTransition,useEffect,useLayoutEffect,useRef,type ComponentProps,type ReactNode} from "react";

const slide={"walk-forward":"walk-slide","walk-back":"walk-slide-back",default:"none"};
function routeArtwork(){
  const root=document.documentElement;
  const sourceX=Number(root.style.getPropertyValue("--walk-route-source-x"))||innerWidth*.3;
  const sourceY=Number(root.style.getPropertyValue("--walk-route-source-y"))||innerHeight*.6;
  const marker=document.querySelector('[aria-label="Start a walk progress"] li:first-child>span')?.getBoundingClientRect();
  const targetX=marker?marker.left+marker.width/2:innerWidth*.3;
  const targetY=marker?marker.top+marker.height/2:40;
  const lane=Math.max(16,Math.min(sourceX,targetX)-40);
  const horizontal=Math.abs(sourceY-targetY)<120;
  const path=horizontal
    ?`M${sourceX} ${sourceY} C${sourceX} ${sourceY+100},${targetX-60} ${targetY+100},${targetX} ${targetY}`
    :`M${sourceX} ${sourceY} C${lane} ${sourceY+40},${lane} ${targetY+100},${targetX} ${targetY}`;
  // Finish in the visible walkers, accounting for the photo crop.
  const photo=document.querySelector<HTMLImageElement>('[data-start-nature] img[data-active="true"]');
  let walkerX=innerWidth*.8,walkerY=innerHeight*.58;
  if(photo){
    const box=photo.getBoundingClientRect();
    const width=photo.naturalWidth||1800,height=photo.naturalHeight||1195;
    const scale=Math.max(box.width/width,box.height/height);
    const position=getComputedStyle(photo).objectPosition.split(" ").map(value=>parseFloat(value)/100);
    walkerX=box.left+(box.width-width*scale)*(position[0]??.75)+width*scale*.76;
    walkerY=box.top+(box.height-height*scale)*(position[1]??.5)+height*scale*.58;
  }
  walkerX=Math.min(innerWidth-(innerWidth<=600?72:64),Math.max(innerWidth*.55,walkerX));
  walkerY=Math.min(innerHeight-130,Math.max(120,walkerY));
  const arrivalX=innerWidth-18,arrivalY=Math.min(innerHeight-110,walkerY+180);
  // One continuous curve, with soft visibility pulses as it crosses the page.
  const route=`${path} C${targetX+100} ${Math.max(16,targetY-70)},${arrivalX} ${arrivalY-170},${arrivalX} ${arrivalY} C${arrivalX} ${arrivalY+90},${walkerX-70} ${walkerY+100},${walkerX} ${walkerY}`;
  root.style.setProperty("--walk-route-path",`path("${route}")`);
}

const entryIndex=()=> (window as Window & {navigation?:{currentEntry?:{index:number}}}).navigation?.currentEntry?.index;

/** Next restores history synchronously. Snapshot around that restoration, without replacing it. */
export function JourneyHistory({children}:{children:ReactNode}){
  const pathname=usePathname();
  const visited=useRef<string[]>([]),position=useRef(-1),index=useRef<number|undefined>(undefined),traversing=useRef(false);
  const restore=useRef<(()=>void)|null>(null);
  const scrollPositions=useRef(new Map<string,{left:number;top:number}>());
  const committedEntry=useRef("");
  const scrollKey=()=>String(entryIndex()??location.href);
  useLayoutEffect(()=>{
    if(!traversing.current){
      visited.current=visited.current.slice(0,position.current+1);
      visited.current.push(location.href);position.current=visited.current.length-1;
    }
    traversing.current=false;index.current=entryIndex();
    committedEntry.current=scrollKey();
    if(pathname==="/start")routeArtwork();
    restore.current?.();restore.current=null;
  },[pathname]);
  useEffect(()=>{
    const rememberScroll=()=>{if(committedEntry.current)scrollPositions.current.set(committedEntry.current,{left:scrollX,top:scrollY});};
    window.addEventListener("scroll",rememberScroll,{passive:true});
    let replaying=false;
    let active:ReturnType<Document["startViewTransition"]>|null=null;
    const traverse=(event:PopStateEvent)=>{
      if(replaying)return;
      rememberScroll();
      const targetScroll=scrollPositions.current.get(scrollKey());
      const nextIndex=entryIndex();
      const previous=visited.current.lastIndexOf(location.href,position.current-1);
      const next=visited.current.indexOf(location.href,position.current+1);
      const back=nextIndex!==undefined&&index.current!==undefined?nextIndex<index.current:previous!==-1||next===-1;
      const source=visited.current[position.current];
      position.current=back?Math.max(0,previous):next;
      index.current=nextIndex;traversing.current=true;
      // Hash/query-only history and unsupported browsers keep their normal behavior.
      if(!source||(new URL(source).pathname!=="/start"&&location.pathname!=="/start")||new URL(source).pathname===location.pathname||!document.startViewTransition||!document.querySelector('[data-journey-scene]'))return;
      active?.skipTransition();restore.current?.();
      if(matchMedia("(prefers-reduced-motion: reduce)").matches){
        restore.current=()=>{if(targetScroll)window.scrollTo({...targetScroll,behavior:"instant"});};
        return;
      }
      event.stopImmediatePropagation();
      document.documentElement.dataset.journeyHistory="true";
      const transition=document.startViewTransition({types:[back?"walk-history-back":"walk-history-forward"],update:()=>new Promise<void>(resolve=>{
        const timer=window.setTimeout(resolve,4000);
        restore.current=()=>{clearTimeout(timer);if(targetScroll)window.scrollTo({...targetScroll,behavior:"instant"});resolve();};
        // Deliver the original history state once, inside the native snapshot update.
        replaying=true;
        window.dispatchEvent(new PopStateEvent("popstate",{state:event.state}));
        replaying=false;
      })});
      active=transition;
      transition.finished.catch(()=>{}).finally(()=>{
        if(active===transition){delete document.documentElement.dataset.journeyHistory;active=null;}
      });
    };
    window.addEventListener("popstate",traverse,true);
    return ()=>{window.removeEventListener("scroll",rememberScroll);window.removeEventListener("popstate",traverse,true);active?.skipTransition();restore.current?.();delete document.documentElement.dataset.journeyHistory;};
  },[]);
  return <>{children}
    <div className="walk-route-overlay" aria-hidden="true">{Array.from({length:25},(_,index)=><ViewTransition key={`${pathname}-${index}`} name={`walk-route-point-${index}`} default="none" share={{"walk-forward":`walk-route-${index===0?"tip":"tail"}`,default:"none"}}><span className={index===0?"walk-route-point walk-route-point--tip":"walk-route-point"}/></ViewTransition>)}</div>
  </>;
}

/** React coordinates both snapshots with the route commit; no delayed router push. */
export function JourneyScene({children}:{children:ReactNode}) {
  return <ViewTransition name="walk-scene" default="none" enter={slide} exit={slide} share={slide} update={slide}><div className="walk-scene">{children}</div></ViewTransition>;
}

export function JourneyNavigation({children}:{children:ReactNode}) {
  return <ViewTransition name="walk-navigation" default="none" enter={slide} exit={slide} share={slide} update={slide}>{children}</ViewTransition>;
}

export default function JourneyLink(props:ComponentProps<typeof Link>){
  const pathname=usePathname();
  if(pathname!=="/start"&&props.href!=="/start")return <Link {...props}/>;
  const back=pathname==="/start"&&props.href!=="/start";
  return <Link {...props} onClick={event=>{
    props.onClick?.(event);
    if(!back&&!event.defaultPrevented){
      const rect=event.currentTarget.getBoundingClientRect();
      document.documentElement.style.setProperty("--walk-route-source-x",String(Math.min(innerWidth-20,rect.right+12)));
      document.documentElement.style.setProperty("--walk-route-source-y",String(rect.top+rect.height/2));
    }
  }} transitionTypes={props.transitionTypes??[back?"walk-back":"walk-forward"]}/>;
}
