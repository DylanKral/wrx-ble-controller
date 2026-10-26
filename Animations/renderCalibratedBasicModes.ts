/**
 * WRX calibrated Basic mode simulation renderer.
 * Simulator ONLY; do not transmit BLE packets from this module.
 * Modes 4 and 10 take user-selected RGB, other modes retain measured RGB.
 * The Mode 10 enhancements match approved Mode 4/10 preview v2 defaults.
 */
export type RGBHex = `#${string}`;
export type Side = 'left' | 'right';
export interface RGBFrame {frame:number; timeSeconds:number; colors:string[]}
export interface CalibrationRecord {mode:number; name:string; cycleSeconds:number; frames:RGBFrame[];
  colorBehavior?:{source?:string; brightnessFloor?:number}}
export interface RenderOptions { brightnessFloor?:number; mode10EnhanceFade?:boolean; mode10FadeIntensity?:number }
export function canonicalHex(value:string):RGBHex {
  const s=value.trim().toLowerCase();
  if(/^#[a-f0-9]{6}$/.test(s)) return s as RGBHex;
  if(/^#[a-f0-9]{3}$/.test(s)) return ('#'+[...s.slice(1)].map(c=>c+c).join('')) as RGBHex;
  throw new Error(`Invalid RGB color: ${value}`);
}
const hexToRGB=(v:string)=>{const h=canonicalHex(v);return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const toHex=(v:number[])=>('#'+v.map(c=>Math.round(clamp(c,0,255)).toString(16).padStart(2,'0')).join('')) as RGBHex;
const boundsCache = new WeakMap<CalibrationRecord,Array<{min:number,max:number}>>();
function breatheBounds(cal:CalibrationRecord){
 let bounds=boundsCache.get(cal); if(bounds)return bounds;
 bounds=Array.from({length:19},(_,i)=>{
   const vals=cal.frames.map(f=>hexToRGB(f.colors[i])[2]);
   return {min:Math.min(...vals),max:Math.max(...vals)};
 }); boundsCache.set(cal,bounds); return bounds;
}
export function renderCalibratedFrame(cal:CalibrationRecord, frame:RGBFrame, selectedColor:string, options:RenderOptions={}) {
 if(frame.colors.length!==19) throw new Error(`Mode ${cal.mode} expected 19 LED colors`);
 if(cal.mode!==4 && cal.mode!==10) return frame.colors.slice();
 const selected=hexToRGB(selectedColor);
 const floor=clamp(options.brightnessFloor??cal.colorBehavior?.brightnessFloor??(cal.mode===10?115:70),0,245);
 const enhance=cal.mode===10 && (options.mode10EnhanceFade??true);
 const depth=clamp(options.mode10FadeIntensity??100,0,100)/100;
 const bounds=enhance?breatheBounds(cal):null;
 return frame.colors.map((raw,i)=>{
  const rgb=hexToRGB(raw), peak=Math.max(...rgb);
  let intensity=clamp((peak-floor)/(255-floor),0,1);
  if(bounds){
   const {min,max}=bounds[i];
   const norm=clamp((rgb[2]-min)/Math.max(1,max-min),0,1);
   intensity=intensity*(1-depth)+norm*depth;
  }
  return toHex(selected.map(c=>c*intensity));
 });
}
export function getFrameAtTime(cal:CalibrationRecord,elapsed:number,repeat=false):RGBFrame {
 if(!cal.frames.length) throw new Error(`No frames for mode ${cal.mode}`);
 const dur=cal.cycleSeconds;
 const t=repeat && dur>0 ? ((elapsed%dur)+dur)%dur:clamp(elapsed,0,dur);
 let lo=0,hi=cal.frames.length-1;
 while(lo<hi){const mid=(lo+hi+1)>>>1;if(cal.frames[mid].timeSeconds<=t)lo=mid;else hi=mid-1;}
 return cal.frames[lo];
}
export function ledSvgId(side:Side, index:number):string {
 if(!Number.isInteger(index)||index<1||index>19) throw new Error('LED index must be 1–19');
 if(index<=7)return `${side}-top-${String(index).padStart(2,'0')}`;
 if(index<=9)return `${side}-side-${String(index-7).padStart(2,'0')}`;
 return `${side}-lower-${String(index-9).padStart(2,'0')}`;
}
