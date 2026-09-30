export function registrationSubmissionMessage(error:unknown){
  const message=error instanceof Error?error.message:"City submission failed.";
  if(message.includes("identity already has a city awaiting review")){
    return "This organizer identity already has a city awaiting review. Complete that review in the dashboard or connect a different organizer identity before starting another city.";
  }
  return message;
}
