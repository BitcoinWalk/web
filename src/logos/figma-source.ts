import {z} from "zod";

const bounds=z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().positive().max(16000),height:z.number().positive().max(16000)});
type Node={id:string;type:string;name?:string;children?:Node[];characters?:string;style?:unknown;absoluteBoundingBox?:unknown};
const font=z.object({fontFamily:z.string().min(1),fontPostScriptName:z.string().optional(),fontSize:z.number().positive(),fontWeight:z.number().optional(),italic:z.boolean().optional()}).passthrough();

export function inspectCityTemplate(value:unknown,caption:string) {
  const root=value as Node;
  if(!root || !Array.isArray(root.children) || root.children.length!==10)throw new Error("Expected exactly ten template variants");
  const expected=new Set(["black","white"].flatMap(background=>["bitcoinwalk-vertical","bitcoinwalk","bitcoinwalk-horizontal","satsman","satsman-vertical"].map(variant=>`-${variant}-on-${background}`)));
  return root.children.map(node=>{
    if(!node.name || !expected.delete(node.name) || !node.id)throw new Error("Unexpected or duplicate template variant");
    const captions:Node[]=[];
    let count=0;
    function visit(item:Node,depth:number){
      if(++count>2000 || depth>30)throw new Error("Template is too complex");
      if(item.type==="TEXT" && item.characters?.trim().normalize("NFC")===caption.normalize("NFC"))captions.push(item);
      for(const child of item.children??[])visit(child,depth+1);
    }
    visit(node,0);
    if(captions.length!==1)throw new Error("Each variant must contain one exact city caption");
    const text=captions[0];
    return {id:node.id,name:node.name,bounds:bounds.parse(node.absoluteBoundingBox),text:{id:text.id,characters:text.characters,style:font.parse(text.style),bounds:bounds.parse(text.absoluteBoundingBox)}};
  });
}

export function safeExportUrl(value:string):string {
  const url=new URL(value);
  const allowed=url.hostname==="figma.com" || url.hostname.endsWith(".figma.com") || /^figma-[a-z0-9-]+\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname);
  if(url.protocol!=="https:" || !allowed || url.username || url.password || url.port || url.hash)throw new Error("Untrusted export origin");
  return url.href;
}
