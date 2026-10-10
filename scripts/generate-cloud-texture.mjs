/** Reproducible, original cloud density sprite; no external images or services.
 * Run: node scripts/generate-cloud-texture.mjs
 * A ray-marched density field supplies soft edges and upper-left sunlight. The
 * runtime distributes these puffs in 3D rather than flattening cloud geometry.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
const resolution = 256;
const centers = [
  [-.38,-.05,0,.48], [.05,.18,.05,.57], [.45,-.05,-.05,.43],
  [-.2,.42,-.1,.35], [.29,.37,-.1,.33], [-.54,.23,0,.3],
  [.61,.14,.06,.25], [-.1,-.22,.16,.39], [.35,-.2,.1,.34],
];
function hash(x,y,z) { const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return n-Math.floor(n); }
const lerp=(a,b,t)=>a+(b-a)*t;
function noise(x,y,z) {
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
 const fx=x-ix,fy=y-iy,fz=z-iz;
 const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sz=fz*fz*(3-2*fz);
 return lerp(lerp(lerp(hash(ix,iy,iz),hash(ix+1,iy,iz),sx),lerp(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),sx),sy),lerp(lerp(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),sx),lerp(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),sx),sy),sz);
}
function density(x,y,z) {
 let distance=-2;
 for(const [cx,cy,cz,r] of centers)distance=Math.max(distance,r-Math.hypot(x-cx,y-cy,z-cz));
 if(distance<-.09)return 0;
 const n=noise(x*8+6,y*8,z*8)*.12+noise(x*19,y*19+9,z*19)*.045;
 return Math.max(0,(distance+n-.09)*7);
}
const bytes=Buffer.alloc(resolution*(1+resolution*4));
for(let py=0;py<resolution;py++) {
 for(let px=0;px<resolution;px++) {
  const x=px/(resolution-1)*2.5-1.25, y=1.25-py/(resolution-1)*2.5;
  let transmittance=1,r=0,g=0,b=0;
  for(let step=0;step<34 && transmittance>.003;step++) {
   const z=.85-step*.05, d=density(x,y,z);
   if(d===0)continue;
   const shadow=density(x-.11,y+.19,z+.15)*.42+density(x-.22,y+.38,z+.3)*.18;
   const light=Math.exp(-shadow*1.5);
   const opacity=1-Math.exp(-d*.19), weight=transmittance*opacity;
   r+=weight*lerp(.49,1,light);g+=weight*lerp(.60,1,light);b+=weight*lerp(.70,1,light);
   transmittance*=1-opacity;
  }
  const alpha=1-transmittance, off=py*(resolution*4+1)+1+px*4;
  bytes[off]=Math.round((alpha?r/alpha:1)*255);bytes[off+1]=Math.round((alpha?g/alpha:1)*255);bytes[off+2]=Math.round((alpha?b/alpha:1)*255);bytes[off+3]=Math.round(alpha*255);
 }
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const t=Buffer.from(type),all=Buffer.concat([t,data]);let crc=0xffffffff;for(const b of all)crc=crcTable[(crc^b)&255]^(crc>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,all,tail]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(resolution,0);ihdr.writeUInt32BE(resolution,4);ihdr[8]=8;ihdr[9]=6;
fs.writeFileSync(new URL('../client/public/textures/cumulus-density.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]));
console.log('Wrote original 256 × 256 ray-marched cloud texture.');
