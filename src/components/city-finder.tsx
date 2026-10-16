"use client";
import SearchablePicker,{filterSearchablePickerItems,type SearchablePickerItem,type SearchablePickerState} from "./searchable-picker";

export type CityFinderItem=SearchablePickerItem;
export const filterCityFinderItems=filterSearchablePickerItems;
export default function CityFinder({items,value,onChange,disabled=false,label="City",placeholder="Search cities…",state="ready",errorMessage,onRetry}:{items:CityFinderItem[];value:string;onChange:(id:string)=>boolean|void;disabled?:boolean;label?:string;placeholder?:string;state?:SearchablePickerState;errorMessage?:string;onRetry?:()=>void}){
 return <SearchablePicker items={items} value={value} onChange={onChange} disabled={disabled} label={label} placeholder={placeholder} state={state} errorMessage={errorMessage} onRetry={onRetry} listLabel="Cities" singular="city" plural="cities" clearLabel="Clear selected city" emptyMessage="No matching cities. Try another name."/>;
}
