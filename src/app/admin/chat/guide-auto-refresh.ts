export function startGuideAutoRefresh(refresh:()=>void, page:Pick<Document,"hidden"|"addEventListener"|"removeEventListener">=document){
 const tick=()=>{if(!page.hidden)refresh();};
 const timer=setInterval(tick,5000);
 page.addEventListener("visibilitychange",tick);
 return()=>{clearInterval(timer);page.removeEventListener("visibilitychange",tick);};
}
