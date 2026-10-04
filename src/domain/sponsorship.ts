import {z} from "zod";
export const SPONSORSHIP_KIND=30311;
export const SPONSORSHIP_ID="bitcoinwalk-sponsorship";
const hex64=z.string().regex(/^[0-9a-f]{64}$/);
const httpsUrl=z.string().max(2048).url().refine(value=>{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password&&(!url.port||url.port==="443")&&url.hostname.includes(".")&&!/^[\d.]+$/.test(url.hostname)&&!url.hostname.includes(":")&&!/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname);},"Sponsor website must be a public HTTPS URL.");
export const sponsorshipSchema=z.object({
 version:z.literal(1),
 scope:z.discriminatedUnion("type",[
  z.object({type:z.literal("city"),cityId:z.string().uuid()}),
  z.object({type:z.literal("walk"),cityId:z.string().uuid(),address:z.string().min(1).max(512)}),
 ]),
 mode:z.enum(["inherit","hidden","empty","sponsor"]),
 sponsorPubkey:hex64.optional(),
 website:httpsUrl.optional(),
 startsAt:z.number().int().nonnegative().optional(),
 endsAt:z.number().int().positive().optional(),
 previousRevisionId:hex64.optional(),
}).superRefine((value,context)=>{
 if(value.scope.type==="city"&&value.mode==="inherit")context.addIssue({code:"custom",path:["mode"],message:"A city cannot inherit sponsorship."});
 if(value.mode==="sponsor"&&!value.sponsorPubkey)context.addIssue({code:"custom",path:["sponsorPubkey"],message:"Choose a sponsor."});
 if(value.mode!=="sponsor"&&(value.sponsorPubkey||value.website))context.addIssue({code:"custom",path:["mode"],message:"Only sponsor assignments can contain sponsor details."});
 if(value.startsAt!==undefined&&value.endsAt!==undefined&&value.endsAt<=value.startsAt)context.addIssue({code:"custom",path:["endsAt"],message:"End must be after start."});
});
export type Sponsorship=z.infer<typeof sponsorshipSchema>;
export type SponsorshipInput=z.input<typeof sponsorshipSchema>;
export type SponsorshipPresentation={state:"hidden"|"empty"}|{state:"sponsor";pubkey:string;website?:string};
