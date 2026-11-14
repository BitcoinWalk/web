import {beforeEach,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {mediaRequestTemplate} from "../../../../domain/media-request";
import {ChatUploadMembershipError} from "../../../../server/chat-upload-membership";
const mocks=vi.hoisted(()=>({store:vi.fn(),membership:vi.fn()}));
vi.mock("../../../../server/media-store",()=>({storeChatImage:mocks.store}));
vi.mock("../../../../server/chat-upload-membership",async original=>({...await original<object>(),requireChatUploadMembership:mocks.membership}));
import {POST} from "./route";
function upload(tamper=false){
 const bytes=Buffer.from("image fixture");
 const event=finalizeEvent(mediaRequestTemplate({action:"upload-chat-image",relay:"wss://chat-staging.bitcoinwalk.org/",groupId:"city-a",sha256:createHash("sha256").update(bytes).digest("hex"),mime:"image/png",bytes:bytes.length}),generateSecretKey());
 const form=new FormData();form.set("event",JSON.stringify(event));form.set("file",new File([tamper?Buffer.alloc(bytes.length):bytes],"photo.png",{type:"image/png"}));
 return new Request("https://app-staging.bitcoinwalk.org/api/chat/media",{method:"POST",body:form});
}
beforeEach(()=>{vi.resetAllMocks();mocks.store.mockResolvedValue({internalUrl:"https://bitcoinwalk.org/image",contentHash:"a".repeat(64)});});
it("checks membership before storing a legitimate upload",async()=>{expect((await POST(upload())).status).toBe(200);expect(mocks.membership).toHaveBeenCalledOnce();expect(mocks.store).toHaveBeenCalledOnce();expect(mocks.membership.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.mock.invocationCallOrder[0]);});
it.each([403,503])("never stores when authorization returns %s",async status=>{mocks.membership.mockRejectedValue(new ChatUploadMembershipError("blocked",status));expect((await POST(upload())).status).toBe(status);expect(mocks.store).not.toHaveBeenCalled();});
it("rejects changed file bytes before membership or storage",async()=>{expect((await POST(upload(true))).status).toBe(400);expect(mocks.membership).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled();});
