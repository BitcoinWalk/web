export function GET(request:Request){
 const target=new URL("/admin/chat?room=hosts",request.url);
 return Response.redirect(target,307);
}
