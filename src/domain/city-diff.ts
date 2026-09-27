import type {CityDocument} from "./city";

export type CityFieldChange={key:string;label:string;before:string;after:string;image?:boolean};
const empty="Not set";
const text=(value:unknown)=>value===undefined||value===null||value===""?empty:String(value);
const aliases=(value:string[]|undefined)=>value?.length?value.join(", "):empty;

export function cityFieldChanges(before:CityDocument|null,after:CityDocument):CityFieldChange[]{
  const fields:Array<CityFieldChange>=[
    {key:"cityName",label:"City name",before:text(before?.cityName),after:text(after.cityName)},
    {key:"aliases",label:"Alternative city names",before:aliases(before?.aliases),after:aliases(after.aliases)},
    {key:"slug",label:"Signed city URL",before:text(before?.slug),after:text(after.slug)},
    {key:"requestedTier",label:"Requested plan",before:text(before?.requestedTier),after:text(after.requestedTier)},
    {key:"startAt",label:"Default start",before:text(before?.startAt),after:text(after.startAt)},
    {key:"description",label:"City description",before:text(before?.description),after:text(after.description)},
    {key:"meetingDescription",label:"Default meeting point",before:text(before?.meetingPoint.description),after:text(after.meetingPoint.description)},
    {key:"latitude",label:"Latitude",before:text(before?.meetingPoint.latitude),after:text(after.meetingPoint.latitude)},
    {key:"longitude",label:"Longitude",before:text(before?.meetingPoint.longitude),after:text(after.meetingPoint.longitude)},
    {key:"chatUrl",label:"Chat URL",before:text(before?.chatUrl),after:text(after.chatUrl)},
    {key:"heroImageUrl",label:"City landscape image",before:text(before?.heroImageUrl),after:text(after.heroImageUrl),image:true},
    {key:"sponsorName",label:"Sponsor name",before:text(before?.sponsor?.name),after:text(after.sponsor?.name)},
    {key:"sponsorLogo",label:"Sponsor logo",before:text(before?.sponsor?.logoUrl),after:text(after.sponsor?.logoUrl),image:true},
    {key:"sponsorOffer",label:"Sponsor offer",before:text(before?.sponsor?.offer),after:text(after.sponsor?.offer)},
  ];
  return before?fields.filter(field=>field.before!==field.after):fields;
}
