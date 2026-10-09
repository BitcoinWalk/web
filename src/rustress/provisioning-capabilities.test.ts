import {DatabaseSync} from "node:sqlite";
import {afterEach,describe,expect,it} from "vitest";
import {cityProvisioningCapabilities} from "./provisioning-capabilities";
const dbs:DatabaseSync[]=[];afterEach(()=>{dbs.forEach(db=>db.close());dbs.length=0;});
function db(){const value=new DatabaseSync(":memory:");dbs.push(value);return value;}
const city="00000000-0000-4000-8000-000000000001";
describe("CMS city provisioning capabilities",()=>{
  it("treats missing state as setup required, never active",()=>{expect(cityProvisioningCapabilities(db(),city)).toMatchObject({overall:"setup-required",retryable:false});});
  it("shows private reservation progress and failure",()=>{const value=db();value.exec("CREATE TABLE rustress_managed_reservation_task(city TEXT,phase TEXT)");
    value.prepare("INSERT INTO rustress_managed_reservation_task VALUES(?,?)").run(city,"queued");expect(cityProvisioningCapabilities(value,city)).toMatchObject({overall:"provisioning"});
    value.prepare("UPDATE rustress_managed_reservation_task SET phase='blocked'").run();expect(cityProvisioningCapabilities(value,city)).toMatchObject({overall:"needs-attention",retryable:true});});
  it("keeps NIP-05 and Lightning independent",()=>{const value=db();value.exec("CREATE TABLE rustress_managed_reservation_task(city TEXT,phase TEXT);CREATE TABLE rustress_activation_task(city TEXT,phase TEXT,nip05 TEXT,lnurl TEXT)");
    value.prepare("INSERT INTO rustress_managed_reservation_task VALUES(?,'verified')").run(city);value.prepare("INSERT INTO rustress_activation_task VALUES(?,'needs-attention','active','needs-attention')").run(city);
    expect(cityProvisioningCapabilities(value,city)).toMatchObject({overall:"needs-attention",nip05:"active",lightning:"needs-attention",retryable:true});
    value.prepare("UPDATE rustress_activation_task SET phase='active',lnurl='active'").run();expect(cityProvisioningCapabilities(value,city)).toMatchObject({overall:"active",nip05:"active",lightning:"active",retryable:false});});
});
