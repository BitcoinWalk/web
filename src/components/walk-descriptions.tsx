import {MarkdownDescription} from "./rich-description";

export default function WalkDescriptions({cityName,cityDescription,eventDescription}:{cityName:string;cityDescription:string;eventDescription:string}) {
  const hasDistinctEventDescription=eventDescription.trim()!==cityDescription.trim();
  return hasDistinctEventDescription
    ? <section className="walk-story" aria-labelledby="event-description-heading">
      <h2 id="event-description-heading">About this walk</h2>
      <MarkdownDescription value={eventDescription}/>
    </section>
    : <section className="walk-story" aria-labelledby="city-description-heading">
      <h2 id="city-description-heading">About BitcoinWalk {cityName}</h2>
      <MarkdownDescription value={cityDescription}/>
    </section>;
}
