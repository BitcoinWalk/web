const alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Encode a WGS84 point as a standard base32 geohash. Nine characters keep
 * meeting-point accuracy while remaining useful to geographic event indexes. */
export function encodeGeohash(latitude:number,longitude:number,precision=9):string {
  if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180)throw new Error("Invalid coordinates for geohash.");
  if(!Number.isInteger(precision)||precision<1||precision>12)throw new Error("Geohash precision must be between 1 and 12.");
  const latitudeRange:[number,number]=[-90,90],longitudeRange:[number,number]=[-180,180];
  let even=true,value=0,bits=0,result="";
  while(result.length<precision){
    const range=even?longitudeRange:latitudeRange,coordinate=even?longitude:latitude,midpoint=(range[0]+range[1])/2;
    value=(value<<1)|(coordinate>=midpoint?1:0);
    if(coordinate>=midpoint)range[0]=midpoint;else range[1]=midpoint;
    even=!even;
    if(++bits===5){result+=alphabet[value];value=0;bits=0;}
  }
  return result;
}
