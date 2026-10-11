type LightningDeviceSignals={userAgent:string;userAgentDataMobile?:boolean;maxTouchPoints?:number};

export function prefersLightningWalletLaunch({userAgent,userAgentDataMobile,maxTouchPoints=0}:LightningDeviceSignals){
 if(typeof userAgentDataMobile==="boolean")return userAgentDataMobile;
 if(/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(userAgent))return true;
 return /Macintosh/i.test(userAgent)&&maxTouchPoints>1;
}

export function currentDevicePrefersLightningWallet(){
 const client=navigator as Navigator&{userAgentData?:{mobile?:boolean}};
 return prefersLightningWalletLaunch({userAgent:client.userAgent,userAgentDataMobile:client.userAgentData?.mobile,maxTouchPoints:client.maxTouchPoints});
}
