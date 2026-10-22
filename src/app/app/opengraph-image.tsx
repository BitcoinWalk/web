import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {ImageResponse} from "next/og";

export const alt="Walkie Talkie — the BitcoinWalk app";
export const size={width:1200,height:630};
export const contentType="image/png";

const logoData=readFile(join(process.cwd(),"public/brand/bitcoinwalk-horizontal-white.png"));
const iconData=readFile(join(process.cwd(),"public/app/walkie-talkie/icon.png"));

export default async function OpenGraphImage(){
 const [logo,icon]=await Promise.all([
  logoData.then(data=>`data:image/png;base64,${data.toString("base64")}`),
  iconData.then(data=>`data:image/png;base64,${data.toString("base64")}`),
 ]);
 return new ImageResponse(<div style={{position:"relative",display:"flex",width:"100%",height:"100%",overflow:"hidden",background:"#171916",color:"white",fontFamily:"Arial, sans-serif"}}>
  <div style={{position:"absolute",top:-170,right:-100,width:520,height:520,borderRadius:260,background:"#7c45de",opacity:.42}}/>
  <div style={{position:"absolute",bottom:-220,left:-100,width:520,height:520,borderRadius:260,background:"#f7931a",opacity:.25}}/>
  <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",width:"760px",padding:"64px 0 60px 72px"}}>
   <img src={logo} width={260} height={48} alt="" style={{objectFit:"contain"}}/>
   <div style={{display:"flex",flexDirection:"column"}}>
    <div style={{display:"flex",marginBottom:18,color:"#c9aaff",fontSize:22,fontWeight:700,letterSpacing:3,textTransform:"uppercase"}}>Walkie Talkie for Android</div>
    <div style={{display:"flex",flexDirection:"column",fontSize:76,fontWeight:800,lineHeight:.95,letterSpacing:-4}}><span>Your BitcoinWalk.</span><span style={{color:"#f7931a"}}>In your pocket.</span></div>
    <div style={{display:"flex",marginTop:24,color:"#d5d7d1",fontSize:25}}>Walks · Community chat · AI Guide · Nostr identity</div>
   </div>
  </div>
  <div style={{position:"absolute",right:72,top:108,display:"flex",width:320,height:414,alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,.16)",borderRadius:72,background:"rgba(255,255,255,.07)",boxShadow:"0 30px 80px rgba(0,0,0,.4)"}}>
   <img src={icon} width={226} height={226} alt="" style={{borderRadius:52,boxShadow:"0 24px 50px rgba(0,0,0,.48)"}}/>
  </div>
 </div>,size);
}
