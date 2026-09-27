import {z} from "zod";

export const CONTENT_PAGE_KIND=30307;
export const HOME_PAGE_ID="00000000-0000-4000-8000-000000000001";
export const RESERVED_CONTENT_SLUGS=new Set(["admin","api","organizer","pilot","preview","start"]);

const optionalText=(max:number)=>z.string().trim().max(max).optional().default("");
export const contentSlugSchema=z.string().regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/,"Use lowercase words separated by hyphens").max(80);
export const contentPageSchema=z.object({
 pageId:z.string().uuid(),slug:contentSlugSchema,title:z.string().trim().min(1).max(160),
 eyebrow:optionalText(160),intro:optionalText(1200),body:optionalText(30000),
 ctaLabel:optionalText(100),ctaHref:optionalText(500),footerTitle:optionalText(160),footerText:optionalText(1200),footerCtaLabel:optionalText(100),
 published:z.boolean(),previousRevisionId:z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).superRefine((page,ctx)=>{
 if(page.pageId===HOME_PAGE_ID&&page.slug!=="")ctx.addIssue({code:"custom",path:["slug"],message:"The homepage URL must remain /."});
 if(page.pageId!==HOME_PAGE_ID&&!page.slug)ctx.addIssue({code:"custom",path:["slug"],message:"Static pages need a URL."});
 if(page.slug&&RESERVED_CONTENT_SLUGS.has(page.slug))ctx.addIssue({code:"custom",path:["slug"],message:"This URL is reserved by the application."});
 if(page.ctaHref&&!/^(?:\/(?!\/)|#[-a-zA-Z0-9_]+$|https:\/\/)/.test(page.ctaHref))ctx.addIssue({code:"custom",path:["ctaHref"],message:"Use a site path, page anchor or an https:// URL."});
});
export type ContentPage=z.infer<typeof contentPageSchema>;

export const DEFAULT_HOME_PAGE:ContentPage={pageId:HOME_PAGE_ID,slug:"",title:"Good company. One walk at a time.",eyebrow:"Step outside. Meet your local Bitcoin community.",intro:"Find a BitcoinWalk near you. Bring your curiosity, meet fellow Bitcoiners, and take the conversation outside.",body:"",ctaLabel:"Find your city ↓",ctaHref:"#find-walk",footerTitle:"Your city could be next.",footerText:"Start a local BitcoinWalk and help people connect in person.",footerCtaLabel:"Start a BitcoinWalk →",published:true};
