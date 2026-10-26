import {z} from "zod";

export const SPONSOR_CATALOGUE_KIND=30313;
export const SPONSOR_CATALOGUE_ID="bitcoinwalk-sponsor-catalogue";
export const SPONSOR_CATALOGUE_ASSET_CITY_ID="00000000-0000-4000-8000-000000000000";
const hex64=z.string().regex(/^[0-9a-f]{64}$/);
const httpsUrl=z.string().max(2048).url().refine(value=>{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password&&(!url.port||url.port==="443")&&url.hostname.includes(".")&&!/^[\d.]+$/.test(url.hostname)&&!url.hostname.includes(":")&&!/(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname);},"Sponsor website must be a public HTTPS URL.");
const common={version:z.literal(1),sponsorPubkey:hex64,previousRevisionId:hex64.optional()};

export const sponsorCatalogueRecordSchema=z.discriminatedUnion("recordType",[
 z.object({...common,recordType:z.literal("claim"),state:z.enum(["active","withdrawn"]),displayName:z.string().trim().min(1).max(80),website:httpsUrl.optional()}),
 z.object({...common,recordType:z.literal("intake"),status:z.literal("pending"),displayName:z.string().trim().min(1).max(80),website:httpsUrl.optional()}),
 z.object({...common,recordType:z.literal("approval"),status:z.enum(["approved","suspended"]),displayName:z.string().trim().min(1).max(80),website:httpsUrl.optional(),logoHash:hex64,source:z.enum(["legacy-assignment","self-claim"]),sourceEventId:hex64,sourceCityId:z.string().uuid(),sourceScopeKey:z.string().min(1).max(640)}),
]);
export type SponsorCatalogueRecord=z.infer<typeof sponsorCatalogueRecordSchema>;
export type SponsorCatalogueRecordInput=z.input<typeof sponsorCatalogueRecordSchema>;
