import {loadChatTarget,chatResolutionStatus} from "../../../../server/chat-target";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const paths=params.getAll("path");
  const result=await loadChatTarget(paths.length===1?paths[0]:"");
  return Response.json(result,{status:chatResolutionStatus(result),headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});
}
