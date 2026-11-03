import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";

const sources=[
 ["start/find-or-start.md","https://docs.bitcoinwalk.org/start/find-or-start/"],
 ["organizers/manage-city-and-walks.md","https://docs.bitcoinwalk.org/organizers/manage-city-and-walks/"],
 ["organizers/transfer-city-ownership.md","https://docs.bitcoinwalk.org/organizers/transfer-city-ownership/"],
 ["hosts/complete-city-setup.md","https://docs.bitcoinwalk.org/hosts/complete-city-setup/"],
 ["sponsors/how-sponsorship-works.md","https://docs.bitcoinwalk.org/sponsors/how-sponsorship-works/"],
 ["chat/walkie-talkie-and-guide.md","https://docs.bitcoinwalk.org/chat/walkie-talkie-and-guide/"],
 ["chat/configure-armada.md","https://docs.bitcoinwalk.org/chat/configure-armada/"],
 ["relays/compatibility.md","https://docs.bitcoinwalk.org/relays/compatibility/"],
 ["relays/run-on-your-own-relay.md","https://docs.bitcoinwalk.org/relays/run-on-your-own-relay/"],
];
const root=resolve("documentation/src/content/docs"),output=resolve("guide-build/knowledge.json"),documents=[];
for(const [path,url] of sources){const content=(await readFile(resolve(root,path),"utf8")).replace(/^---[\s\S]*?---\s*/,"").trim();if(!content||content.length>20_000)throw new Error(`Invalid Guide knowledge document: ${path}`);documents.push({url,content});}
const value={version:1,documents},sha256=createHash("sha256").update(JSON.stringify(value)).digest("hex");await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({...value,sha256})+"\n",{mode:0o600});console.log(`Guide knowledge snapshot: ${documents.length} documents, ${sha256}`);
