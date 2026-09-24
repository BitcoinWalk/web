const hiddenTestCityNames=new Set([
  "organizers permission test",
  "protected editor isolation test",
]);

/** Hide legacy permission-test cities from selectors without changing relay records. */
export function showCityInPicker(name:string):boolean{
  return !hiddenTestCityNames.has(name.trim().toLowerCase());
}
