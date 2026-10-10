type CanvasLike={getContext:(name:string)=>unknown};

/** Capability probe only. Privacy-hardened browsers may return null or throw
 * instead of exposing a WebGL2 context; both are supported fallback paths. */
export function webGL2Available(createCanvas?:()=>CanvasLike):boolean{
  if(!createCanvas&&typeof document==="undefined")return false;
  try{
    const canvas=createCanvas?createCanvas():document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  }catch{return false;}
}
