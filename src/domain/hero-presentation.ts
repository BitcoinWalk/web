export type ShareBackgroundPosition="attention"|"north"|"centre";

const TOP_ALIGNED_MEDIA=new Set([
  "d64d013aee80e3382f0ef7576df259535c57b7d4d4ce5a07fa1a65bab16e21df",
]);

export function managedMediaHash(value:string|undefined|null):string|null{
  if(!value)return null;
  try{return /^\/api\/media\/files\/([a-f0-9]{64})\.webp$/.exec(new URL(value,"https://app-staging.bitcoinwalk.org").pathname)?.[1]??null;}catch{return null;}
}

export function heroObjectPosition(value:string|undefined|null):string{
  return TOP_ALIGNED_MEDIA.has(managedMediaHash(value)??"")?"center top":"center center";
}

export function shareBackgroundPosition(values:Array<string|undefined|null>):ShareBackgroundPosition{
  return values.some(value=>TOP_ALIGNED_MEDIA.has(managedMediaHash(value)??""))?"north":"attention";
}
