/** Public destination intent, not an authentication or membership capability. */
export type ChatTarget = {version:1}&(
  {kind:"city";cityId:string}|{kind:"guide"|"global"|"hosts"}
);
export type ChatLinkIntent = {kind:"city";city:string}|{kind:"guide"|"global"|"hosts"};

/** Accept paths, never arbitrary URLs, credentials or URL-supplied relay claims. */
export function parseChatPath(path:string):ChatLinkIntent|null {
  if(path.length>512||/[?#\\\s]/.test(path))return null;
  if(path==="/chat/guide"||path==="/chat/global"||path==="/chat/hosts")return {kind:path.slice(6) as "guide"|"global"|"hosts"};
  const match=/^\/chat\/city\/([A-Za-z0-9-]{1,128})$/.exec(path);
  return match?{kind:"city",city:match[1]}:null;
}

export function chatTargetPath(target:ChatTarget,citySlug?:string):string {
  if(target.kind!=="city")return `/chat/${target.kind}`;
  if(!citySlug||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(citySlug)||citySlug.length>128)throw new Error("Invalid canonical city slug.");
  return `/chat/city/${citySlug}`;
}
