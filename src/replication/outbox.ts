import {DatabaseSync} from 'node:sqlite';
import {verifyEvent, type Event} from 'nostr-tools';

type Row = {id:string; destination:string; payload:string; attempts:number};
export type Transport = (destination:string,event:Event)=>Promise<{id:string;accepted:boolean}>;

/** Inactive queue foundation, NOT an authorization or ingestion API.
 * A future trusted adapter must verify shared-relay acceptance, current approval,
 * destination scope and policy dependencies before calling enqueue. */
export class PublicWalkOutbox {
  private db:DatabaseSync;
  private busy=false;
  constructor(path:string, private destination:string) {
    const url=new URL(destination);
    if(url.protocol!=='wss:' || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw new Error('Invalid replica endpoint');
    this.destination=url.href;
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT NOT NULL,destination TEXT NOT NULL,payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,
      acknowledged INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(id,destination));`);
  }
  enqueue(input:Event) {
    // Discard cached verification symbols and preserve the signed wire fields.
    const event:Event={id:input.id,pubkey:input.pubkey,sig:input.sig,kind:input.kind,
      created_at:input.created_at,content:input.content,tags:input.tags.map(t=>[...t])};
    if(!verifyEvent(event)) throw new Error('Invalid signature');
    if(event.kind!==31923) throw new Error('Only public calendar occurrences are supported in this increment');
    if(event.tags.some(t=>t.includes('initial-proposal-v1'))) throw new Error('Initial proposals require an approval bundle');
    const payload=JSON.stringify(event);
    if(Buffer.byteLength(payload)>65536) throw new Error('Event too large');
    this.db.prepare('INSERT OR IGNORE INTO deliveries(id,destination,payload) VALUES (?,?,?)').run(event.id,this.destination,payload);
  }
  async deliver(now:number,transport:Transport) {
    if(this.busy) throw new Error('Delivery already running');
    this.busy=true;
    let count=0;
    try {
      const rows=this.db.prepare('SELECT * FROM deliveries WHERE destination=? AND acknowledged=0 AND retry_at<=? ORDER BY rowid LIMIT 20').all(this.destination,now) as Row[];
      for(const row of rows) {
        try {
          const event=JSON.parse(row.payload) as Event;
          if(!verifyEvent(event)||event.id!==row.id) throw new Error('Stored event integrity failure');
          const ack=await transport(row.destination,event);
          if(!ack.accepted||ack.id!==row.id) throw new Error('Missing matching acknowledgement');
          this.db.prepare('UPDATE deliveries SET acknowledged=1,attempts=attempts+1 WHERE id=? AND destination=?').run(row.id,row.destination);
          count++;
        } catch {
          const delay=Math.min(3600,30*2**Math.min(row.attempts,7));
          this.db.prepare('UPDATE deliveries SET attempts=attempts+1,retry_at=? WHERE id=? AND destination=?').run(now+delay,row.id,row.destination);
        }
      }
      return count;
    } finally {this.busy=false;}
  }
  close(){this.db.close();}
}
