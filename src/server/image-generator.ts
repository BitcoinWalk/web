import "server-only";
import {readFile} from "node:fs/promises";

export type CityImagePrompt={cityName:string;latitude:number;longitude:number;meetingPoint:string};
export type GeneratedImage={bytes:Buffer;model:string};
export interface ImageGenerator{generateCityHero(input:CityImagePrompt):Promise<GeneratedImage>}

async function apiKey(){const path=process.env.OPENAI_API_KEY_FILE;if(path)return (await readFile(path,"utf8")).trim();return process.env.OPENAI_API_KEY?.trim()||"";}
export function cityHeroPrompt(input:CityImagePrompt){return `Create one realistic editorial landscape photograph for BitcoinWalk in ${input.cityName}. Use the meeting-area coordinates ${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)} and the description "${input.meetingPoint}" only as geographic context. Show a recognisable local streetscape, landscape, architecture, public space or authentic street art. No people, crowds, faces, bodies, text, logos, Bitcoin symbols, badges, posters, borders or graphic-design treatment. Natural light, believable weather, documentary photography, horizontal 3:2 composition, visually calm, with useful empty space for a future interface overlay. Do not fabricate a landmark if location knowledge is uncertain.`;}
export function ogBackgroundPrompt(prompt:string){const value=prompt.trim();if(!value||value.length>1000)throw new Error("Describe the background in 1 to 1,000 characters.");return `${value}\n\nCreate a polished horizontal background image for an Open Graph card. 1200:630 composition, no text, letters, logos, brands, Bitcoin marks, borders or UI. Leave useful negative space for later text and logo overlays.`;}

export class OpenAIImageGenerator implements ImageGenerator{
 private async generate(prompt:string):Promise<GeneratedImage>{
  const key=await apiKey();if(!key)throw new Error("Image generation is not configured. Add the OpenAI API credential on the server.");
  const model=process.env.BITCOINWALK_IMAGE_MODEL||"gpt-image-2.5-flare-2026-09-08";
  const response=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,prompt,size:"1536x1024",quality:"low",output_format:"webp",n:1}),signal:AbortSignal.timeout(120_000)});
  const text=await response.text();let body:unknown;try{body=JSON.parse(text);}catch{throw new Error(`Image provider returned HTTP ${response.status} with an invalid response.`);}
  if(!response.ok){const message=(body as {error?:{message?:unknown}})?.error?.message;throw new Error(typeof message==="string"?`Image provider: ${message}`:`Image provider returned HTTP ${response.status}.`);}
  const encoded=(body as {data?:Array<{b64_json?:unknown}>})?.data?.[0]?.b64_json;if(typeof encoded!=="string"||!encoded)throw new Error("Image provider returned no image data.");
  const bytes=Buffer.from(encoded,"base64");if(!bytes.length||bytes.length>10*1024*1024)throw new Error("Generated image has an invalid size.");return {bytes,model};
 }
 async generateOgBackground(prompt:string){return this.generate(ogBackgroundPrompt(prompt));}
 async generateCityHero(input:CityImagePrompt):Promise<GeneratedImage>{return this.generate(cityHeroPrompt(input));}
}
