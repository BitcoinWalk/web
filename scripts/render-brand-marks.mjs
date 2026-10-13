import sharp from "sharp";
import {copyFile,mkdir} from "node:fs/promises";

const source="design/city-logo-templates/v1/examples/prototype-packs/warszawa/warszawa-satsman-on-black.png";
await mkdir("public/brand",{recursive:true});
const upper=await sharp(source).extract({left:0,top:0,width:499,height:305}).png().toBuffer();
const mark=await sharp(upper).trim({background:{r:0,g:0,b:0,alpha:0}}).resize({width:420,height:420,fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
await sharp(mark).toFile("public/brand/satsman-white.png");
await sharp(mark).negate({alpha:false}).toFile("public/brand/satsman-ink.png");

const exampleRoot="design/city-logo-templates/v1/examples/prototype-packs/warszawa",publicRoot="public/brand/inkscape";
await mkdir(publicRoot,{recursive:true});
for(const name of [
 "warszawa-bitcoinwalk-vertical-on-black.png","warszawa-bitcoinwalk-on-black.png","warszawa-bitcoinwalk-horizontal-on-black.png","warszawa-satsman-on-black.png","warszawa-satsman-vertical-on-black.png",
 "warszawa-bitcoinwalk-vertical-on-white.png","warszawa-bitcoinwalk-on-white.png","warszawa-bitcoinwalk-horizontal-on-white.png","warszawa-satsman-on-white.png","warszawa-satsman-vertical-on-white.png",
])await copyFile(`${exampleRoot}/${name}`,`${publicRoot}/${name}`);
