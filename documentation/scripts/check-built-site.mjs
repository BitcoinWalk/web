import {readFile,readdir,stat} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),dist=join(root,"dist");
const required=["index.html","sitemap-index.xml","pagefind/pagefind.js","chat/configure-armada/index.html","relays/compatibility/index.html"];
for(const file of required)await stat(join(dist,file));
const html=[];
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await walk(path);else if(entry.name.endsWith(".html"))html.push(path);}}
await walk(dist);
const forbidden=[/\/home\/bitcoinwalk/i,/\/var\/backups/i,/213\.232\.235\./,/127\.0\.0\.1/,/nsec1[023456789acdefghjklmnpqrstuvwxyz]+/i];
const internal=new Set();
for(const path of html){
  const body=await readFile(path,"utf8");
  for(const pattern of forbidden)if(pattern.test(body))throw new Error(`Built documentation leaks private material in ${path}.`);
  for(const match of body.matchAll(/href="(\/[^"]*)"/g)){
    const href=match[1].split(/[?#]/)[0];
    if(!href||href.startsWith("/_")||href.startsWith("/pagefind/"))continue;
    internal.add(href);
  }
}
for(const href of internal){
  const target=href==="/"?join(dist,"index.html"):href.endsWith("/")?join(dist,href,"index.html"):join(dist,href);
  try{await stat(target);}catch{throw new Error(`Broken internal documentation link: ${href}`);}
}
console.log(`Built documentation accepted: ${html.length} HTML pages and ${internal.size} internal links.`);
