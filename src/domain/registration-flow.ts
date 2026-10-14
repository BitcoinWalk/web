export function registrationSubmissionMessage(error:unknown){
  const message=error instanceof Error?error.message:"City submission failed.";
  if(message.includes("identity already has a city awaiting review")){
    return "This host identity already has a city awaiting review. Complete that review in the dashboard or connect a different host identity before starting another city.";
  }
  if(message.includes("initial walk submission limit")){
    return "This host has reached the daily limit for new initial walk proposals. Wait up to 24 hours before trying again; do not create another identity or repeatedly resubmit.";
  }
  return message;
}
