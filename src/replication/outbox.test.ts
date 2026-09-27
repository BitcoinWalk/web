import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {finalizeEvent,generateSecretKey} from 'nostr-tools';
import {PublicWalkOutbox,type Transport} from './outbox';

const dirs:string[]=[];
const queues:PublicWalkOutbox[]=[];
function setup(){const dir=mkdtempSync(join(tmpdir(),'bw-replication-'));dirs.push(dir);return join(dir,'queue.sqlite');}
function open(path:string,url='wss://city.example/'){const q=new PublicWalkOutbox(path,url);queues.push(q);return q;}
function event(kind=31923,tags:string[][]=[['i','city']]){return finalizeEvent({kind,tags,created_at:1700000000,content:'walk'},generateSecretKey());}
afterEach(()=>{for(const q of queues.splice(0)){try{q.close();}catch{}}for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});

it('deduplicates and preserves the signed event through retries and restart',async()=>{
 const path=setup(),q=open(path),e=event();q.enqueue(e);q.enqueue(e);
 expect(await q.deliver(0,async()=>{throw new Error('offline');})).toBe(0);
 q.close();const restarted=open(path);let calls=0;
 const send:Transport=async(url,sent)=>{calls++;expect(url).toBe('wss://city.example/');expect(JSON.parse(JSON.stringify(sent))).toEqual(JSON.parse(JSON.stringify(e)));return {id:sent.id,accepted:true};};
 expect(await restarted.deliver(29,send)).toBe(0);
 expect(await restarted.deliver(30,send)).toBe(1);
 expect(await restarted.deliver(100,send)).toBe(0);expect(calls).toBe(1);
});
it('does not treat a mismatched acknowledgement as success',async()=>{
 const q=open(setup()),e=event();q.enqueue(e);
 expect(await q.deliver(0,async()=>({id:'wrong',accepted:true}))).toBe(0);
 expect(await q.deliver(30,async()=>({id:e.id,accepted:true}))).toBe(1);
});
it('rejects private/chat events, pending first walks and mutated cached signatures',()=>{
 const q=open(setup());expect(()=>q.enqueue(event(9))).toThrow();
 expect(()=>q.enqueue(event(31923,[['x','initial-proposal-v1']]))).toThrow();
 const e=event();e.content='tampered';expect(()=>q.enqueue(e)).toThrow('Invalid signature');
});
it('does not redirect an existing queue to a replacement destination',async()=>{
 const path=setup(),q=open(path);q.enqueue(event());q.close();
 const replacement=open(path,'wss://replacement.example/');
 expect(await replacement.deliver(100,async()=>{throw new Error('must not run');})).toBe(0);
});
