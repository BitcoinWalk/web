export function explainWebPushError(error:unknown,isBrave:boolean):string{
 const message=error instanceof Error?error.message:String(error??"");
 if(/registration failed\s*-\s*push service error/i.test(message)){
  if(isBrave)return "Brave’s push service is turned off. Open brave://settings/privacy, enable ‘Use Google services for push messaging’, relaunch Brave, then try again. Nothing was saved.";
  return "Your browser could not reach its push service. Check browser notification settings and your network, relaunch the browser, then try again. Nothing was saved.";
 }
 return message||"Notification settings are unavailable.";
}

export function webPushPermissionWarning(permission:NotificationPermission|null):string|null{
 if(permission==="denied")return "Notifications are blocked in this browser’s system settings. Your BitcoinWalk inbox still works. Re-enable notifications in settings or remove this saved device.";
 if(permission==="default")return "This browser no longer confirms notification permission. Your BitcoinWalk inbox still works. Enable notifications again or remove this saved device.";
 return null;
}
