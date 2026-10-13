import {createHash} from "node:crypto";
import {copyFile,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceRoot=process.argv[2]??"/home/endo/Downloads/Logo-pack/Logo pack";
const designRoot="design/brand-logo-templates/v1";
const publicRoot="public/brand/inkscape/global";
const assets=[
 ["Bitcoin Walk Logo-avatar.png","bitcoinwalk-avatar-orange","Symbol in orange roundel"],
 ["Bitcoin Walk Logo-avatar_black.png","bitcoinwalk-avatar-ink","Symbol in ink roundel"],
 ["Bitcoin Walk Logo-avatar_white.png","bitcoinwalk-avatar-reversed","Reversed symbol on orange"],
 ["Bitcoin Walk Logo-icon-orange.png","bitcoinwalk-symbol-orange","Standalone orange symbol"],
 ["Bitcoin Walk Logo-icon_black.png","bitcoinwalk-symbol-ink","Standalone ink symbol"],
 ["Bitcoin Walk Logo-icon-white.png","bitcoinwalk-symbol-reversed","Reversed standalone symbol"],
 ["Bitcoin Walk Logo-horizontal.png","bitcoinwalk-horizontal","Horizontal standard logo"],
 ["Bitcoin Walk Logo-horizontal-black.png","bitcoinwalk-horizontal-ink","Horizontal ink logo"],
 ["Bitcoin Walk Logo-horizontal-white.png","bitcoinwalk-horizontal-reversed","Horizontal reversed logo"],
 ["Bitcoin Walk Logo-vertical.png","bitcoinwalk-vertical","Vertical standard logo"],
 ["Bitcoin Walk Logo-vertical-black.png","bitcoinwalk-vertical-ink","Vertical ink logo"],
 ["Bitcoin Walk Logo-vertical-white.png","bitcoinwalk-vertical-reversed","Vertical reversed logo"],
];

const escapeXml=value=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
await Promise.all([
 mkdir(`${designRoot}/source-pngs`,{recursive:true}),
 mkdir(`${designRoot}/editable-masters`,{recursive:true}),
 mkdir(`${publicRoot}/previews`,{recursive:true}),
]);

const manifest=[];
for(const [sourceName,slug,label] of assets){
 const source=path.join(sourceRoot,sourceName);
 const bytes=await readFile(source);
 const metadata=await sharp(bytes).metadata();
 if(!metadata.width||!metadata.height)throw new Error(`Missing dimensions for ${sourceName}`);
 const sha256=createHash("sha256").update(bytes).digest("hex");
 const pngName=`${slug}.png`,svgName=`${slug}.svg`;
 await copyFile(source,`${designRoot}/source-pngs/${pngName}`);
 await copyFile(source,`${publicRoot}/${pngName}`);
 const preview=await sharp(bytes).trim({background:{r:0,g:0,b:0,alpha:0}}).resize({width:1200,height:800,fit:"inside",withoutEnlargement:true}).png().toBuffer();
 await writeFile(`${publicRoot}/previews/${pngName}`,preview);
 const svg=`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="${metadata.width}" height="${metadata.height}" viewBox="0 0 ${metadata.width} ${metadata.height}">
  <title>${escapeXml(label)} — BitcoinWalk city-neutral master</title>
  <metadata><bitcoinwalk:source xmlns:bitcoinwalk="https://bitcoinwalk.org/ns/brand-logo-source/1" variant="${slug}" source-file="${escapeXml(sourceName)}" sha256="${sha256}" status="pixel-preserved-inkscape-master" /></metadata>
  <sodipodi:namedview pagecolor="#d9d9d9" bordercolor="#666666" inkscape:document-units="px" />
  <g inkscape:groupmode="layer" inkscape:label="Approved BitcoinWalk artwork — locked" sodipodi:insensitive="true">
    <image x="0" y="0" width="${metadata.width}" height="${metadata.height}" preserveAspectRatio="none" xlink:href="data:image/png;base64,${bytes.toString("base64")}" />
  </g>
</svg>
`;
 await writeFile(`${designRoot}/editable-masters/${svgName}`,svg);
 await writeFile(`${publicRoot}/${svgName}`,svg);
 manifest.push({slug,label,sourceFile:sourceName,png:pngName,svg:svgName,width:metadata.width,height:metadata.height,sha256});
}
await writeFile(`${designRoot}/manifest.json`,`${JSON.stringify({version:1,status:"approved-source-preservation",cityNeutral:true,assets:manifest},null,2)}\n`);
console.log(`Imported ${manifest.length} city-neutral BitcoinWalk logo masters.`);
