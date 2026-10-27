"""Native HappyLighting Mode 7/8 analysis; never infer BLE timestamps or exact bytes.
Install optional tools into test-results/video-tools as in analyze-overlap-videos.py.
"""
from pathlib import Path
import argparse, csv, hashlib, json, math, sys, xml.etree.ElementTree as ET
sys.path.insert(0, str(Path("test-results/video-tools").resolve()))
import cv2
import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--videos", type=Path, required=True)
parser.add_argument("--output", type=Path, default=Path("docs/analysis/native-overlap"))
args = parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
records = json.loads(Path("Animations/wrx-basic-modes-final-calibrations.json").read_text())["records"]
plans = {
    "IMG_1602.mp4": {"mode": 7, "keys": [15,180,360,720,900],
        "windows": [(7.95,10.87),(15.55,22.8),(27.2,28.4)],
        "transition_bounds": [(10.9,15.7),(23.3,27.3)],
        "direction": "lower inner (19) -> outside corner -> top inner (1)"},
    "IMG_1603.mp4": {"mode": 8, "keys": [15],
        "points": [(320,498),(286,494),(254,490),(222,486),(190,482),(158,478),(126,474),(130,501),(136,526),(151,550),(188,571),(219,589),(248,605),(277,618),(305,629),(333,640),(360,650),(389,657),(420,667)],
        "windows": [(2.65,5.95),(10.45,18.85),(20.7,21.94)],
        "transition_bounds": [(5.967,10.6),(18.767,20.8)],
        "direction": "top inner (1) -> outside corner -> lower inner (19)"},
}

def yellow_points(frame):
    hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
    mask=((hsv[:,:,1]>110)&(hsv[:,:,2]>140)&(hsv[:,:,0]>20)&(hsv[:,:,0]<50)).astype(np.uint8)
    mask[:330]=0; mask[710:]=0; mask[:,:80]=0
    _, labels, stats, centers=cv2.connectedComponentsWithStats(mask)
    regions=[i for i in range(1,len(stats)) if stats[i,4]>90]
    top=max(regions,key=lambda i:stats[i,4]); rest=sorted((i for i in regions if i!=top),key=lambda i:centers[i,1])
    if len(rest)!=12: raise ValueError("Expected top bar, two side and ten lower zones in steady keyframe")
    ys,xs=np.where(labels==top); slope,intercept=np.polyfit(xs,ys,1)
    top_x=np.linspace(float(xs.max())-18,float(xs.min())+18,7)
    return np.array([(x,slope*x+intercept) for x in top_x]+[tuple(centers[i]) for i in rest],np.float32)

def events(rgb, quality, windows, red_limit=22, cyan_limit=80):
    h,s,v=np.moveaxis(cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV),-1,0)
    output=[]
    for lo,hi in windows:
        zones=[]
        for z in range(9,19):
            valid=(quality>=6)&(s[:,z]>60)&(v[:,z]>80)
            def onset(active, minimum):
                starts=np.flatnonzero(active&~np.r_[False,active[:-1]])
                return next((int(i) for i in starts if minimum < i/30 < hi and active[i:i+2].sum()==2),None)
            r=onset(((h[:,z]<red_limit)|(h[:,z]>175))&valid,lo)
            c=onset((h[:,z]>=cyan_limit)&(h[:,z]<112)&valid,r/30+.1) if r is not None else None
            y=onset((h[:,z]>=22)&(h[:,z]<48)&valid,r/30+.1) if r is not None else None
            zones.append({"zone":z+1,"red_frame":r,"cyan_frame":c,"yellow_frame":y,
                "red_to_cyan_s":(c-r)/30 if c is not None else None})
        durations=[z["red_to_cyan_s"] for z in zones if z["red_to_cyan_s"] is not None]
        output.append({"zones":zones,"valid_zones":len(durations),"median_red_to_cyan_s":float(np.median(durations)),
            "range_s":[min(durations),max(durations)],"window_s":[lo,hi]})
    return output

def svg_frame(record, seconds, path):
    frame=next((f for f in reversed(record["frames"]) if f["timeSeconds"]<=seconds),record["frames"][0])
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree=ET.parse("Animations/wrx-taillights-19zone.svg")
    for node in tree.iter():
        ident=node.get("id","")
        for side in ("left","right"):
            for index,color in enumerate(frame["colors"],1):
                zone,number=("top",index) if index<=7 else ("side",index-7) if index<=9 else ("lower",index-9)
                if ident==f"{side}-{zone}-{number:02}": node.set("fill",color); node.set("style",f"fill:{color};opacity:1")
    tree.write(path,encoding="unicode")

report={"metric":"red-to-cyan phase interval, not full cycle or native one-shot duration",
    "sequence":"User supplied default -> leftmost slow -> rightmost fast; boundaries are not assumed to divide clip equally",
    "byte_anchors":{"default":129,"slow":1,"fast":255,"status":"provisional; no synchronized byte log"},
    "videos":{},"reference_assets_unchanged":True}
panels=[]; comparisons=[]
for name,plan in plans.items():
    path=next(iter(args.videos.rglob(name)),None)
    if path is None: raise SystemExit(f"Missing {name}")
    cap=cv2.VideoCapture(str(path)); fps=cap.get(cv2.CAP_PROP_FPS); count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); refs={}
    for key in plan["keys"]:
        cap.set(cv2.CAP_PROP_POS_FRAMES,key); ok,frame=cap.read()
        if not ok: raise ValueError("Keyframe could not be decoded")
        points=yellow_points(frame) if len(plan["keys"])>1 else np.array(plan["points"],np.float32)
        gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY); mask=np.full_like(gray,255)
        x0,y0=np.floor(points.min(0)-30).astype(int);x1,y1=np.ceil(points.max(0)+30).astype(int)
        mask[max(0,y0):min(gray.shape[0],y1),max(0,x0):min(gray.shape[1],x1)]=0
        corners=cv2.goodFeaturesToTrack(gray,250,.01,8,mask=mask)
        refs[key]=(gray,corners,points)
    cap.set(cv2.CAP_PROP_POS_FRAMES,0); rows=[]; samples=[]; core=[]; quality=[]; stored={}
    contact=Image.new("RGB",(1024,1920),"#101b2d"); draw=ImageDraw.Draw(contact)
    contact_at={round(i*(count-1)/15):i for i in range(16)}
    while True:
        ok,frame=cap.read()
        if not ok: break
        i=len(rows); key=min(refs,key=lambda k:abs(k-i)); gray,corners,points=refs[key]
        tracked,status,_=cv2.calcOpticalFlowPyrLK(gray,cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),corners,None); good=status[:,0]==1
        transform,inliers=cv2.estimateAffinePartial2D(corners[good],tracked[good],method=cv2.RANSAC,ransacReprojThreshold=3)
        q=int(inliers.sum()) if transform is not None else 0
        current=points@transform[:,:2].T+transform[:,2] if transform is not None else points
        colors=[]; scolors=[]; row={"frame":i,"time_s":round(i/fps,6),"pts_s":round(cap.get(cv2.CAP_PROP_POS_MSEC)/1000,6),"keyframe":key,"inliers":q}
        for z,(x,y) in enumerate(current,1):
            x,y=round(float(x)),round(float(y));valid=q>=6 and 7<=x<frame.shape[1]-7 and 7<=y<frame.shape[0]-7
            if valid:
                rgb=np.median(frame[y-2:y+3,x-2:x+3],axis=(0,1))[::-1]
                patch=frame[y-6:y+7,x-6:x+7];hsv=cv2.cvtColor(patch,cv2.COLOR_BGR2HSV)
                use=(hsv[:,:,1]>=max(50,np.percentile(hsv[:,:,1],70)))&(hsv[:,:,2]>80)
                srgb=np.median(patch[use],axis=0)[::-1] if use.sum()>3 else rgb
                clipping=float(np.mean((patch>=250).sum(2)>=2))
            else: rgb=srgb=np.array([0,0,0]);clipping=0
            colors.append(rgb);scolors.append(srgb);row[f"z{z:02}_valid"]=int(valid);row[f"z{z:02}_clipping_fraction"]=round(clipping,3)
            for prefix,value in [("",rgb),("s_",srgb)]:
                for channel,v in zip("rgb",value):row[f"z{z:02}_{prefix}{channel}"]=int(v)
        rows.append(row);quality.append(q);core.append(colors);samples.append(scolors)
        if i in contact_at:
            cell=contact_at[i];im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));im.thumbnail((256,450));x,y=cell%4*256,cell//4*480;contact.paste(im,(x,y+25));draw.text((x+3,y+6),f"{name} f{i} {i/fps:.3f}s",fill="white")
        # Retain only comparison windows to avoid copying videos into the repo.
        if any(lo-1 <= i/fps <= hi+1 for lo,hi in plan["windows"]): stored[i]=(frame.copy(),current.copy())
        if i in plan["keys"]:
            im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));d=ImageDraw.Draw(im)
            for z,(x,y) in enumerate(current,1):d.ellipse((x-3,y-3,x+3,y+3),outline="lime");d.text((x+3,y-10),str(z),fill="lime")
            im.save(args.output/f"{path.stem}-points-{i}.png")
    cap.release();contact.save(args.output/f"{path.stem}-contact.png")
    with (args.output/f"{path.stem}-zones.csv").open("w",newline="") as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
    samples=np.array(samples,np.uint8);quality=np.array(quality)
    central=events(samples,quality,plan["windows"])
    sensitivity={f"red<{r},cyan>={c}":events(samples,quality,plan["windows"],r,c) for r,c in [(18,75),(25,85)]}
    medians=[s["median_red_to_cyan_s"] for s in central];factors=[m/medians[0] for m in medians]
    record=next(r for r in records if r["mode"]==plan["mode"])
    original=np.array([[[int(c[j:j+2],16) for j in (1,3,5)] for c in f["colors"]] for f in record["frames"]],np.uint8)
    # Use the same red/cyan classifier on the original reference for comparison.
    original_events=events(original,np.full(len(original),100),[(-.001,3.5)])[0]
    spatial=[]
    for segment,factor in zip(central,factors):
        offsets=[z["red_frame"]/fps-original_events["zones"][i]["red_frame"]/30*factor for i,z in enumerate(segment["zones"]) if z["red_frame"] is not None and original_events["zones"][i]["red_frame"] is not None]
        origin=float(np.median(offsets))
        residuals=[(z["red_frame"]/fps-origin)/factor-original_events["zones"][i]["red_frame"]/30 for i,z in enumerate(segment["zones"]) if z["red_frame"] is not None and original_events["zones"][i]["red_frame"] is not None]
        spatial.append({"aligned_reference_origin_s":origin,"median_abs_normalized_red_front_residual_s":float(np.median(np.abs(residuals))),"red_onset_span_s":(max(z["red_frame"] for z in segment["zones"] if z["red_frame"] is not None)-min(z["red_frame"] for z in segment["zones"] if z["red_frame"] is not None))/fps})
    video={"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"frames":len(rows),"fps":fps,"width":512,"height":910,"duration_s":len(rows)/fps,"mode_from_direction":plan["mode"],"direction":plan["direction"],
        "clean_analysis_windows_s":plan["windows"],"speed_change_uncertainty_bounds_s":plan["transition_bounds"],"measurements":central,"sensitivity":sensitivity,"duration_factors_reference_slow_fast":factors,
        "reference_track_red_to_cyan_s":original_events["median_red_to_cyan_s"],"normalized_spatial_alignment":spatial,
        "registration_keyframes":{str(k):r[2].tolist() for k,r in refs.items()},
        "limitations":"One clean sweep per speed, not multiple independent full cycles. Zone samples are correlated. At least +/-2 frames (67ms) timing uncertainty, more at clipped zones. Segment boundaries fall in steady holds and exact slider-change times/bytes are not recorded. No evidence justifies replacing approved RGB/fades or adding speed-dependent geometry."}
    report["videos"][name]=video
    for label,values in [("core",core),("color-selected",samples)]:panels.append((name+" "+label,np.array(values,np.uint8),len(rows)/fps))
    for index,(setting,byte,wall) in enumerate([("reference",129,1.0),("slow",1,2.0),("fast",255,.8)]):
        factor=factors[index];old=1 if byte==129 else math.sqrt((3.79/1.69)*(6.3/3.54)) if byte==1 else math.sqrt((.6/1.69)*(.54/3.54))
        prefix=f"mode-{plan['mode']}-{setting}"
        svg_frame(record,wall/old,args.output/f"{prefix}-before.svg");svg_frame(record,wall/factor,args.output/f"{prefix}-after.svg")
        at=round((spatial[index]["aligned_reference_origin_s"]+wall)*fps);frame,points=stored[at]
        x0,y0=np.maximum(0,np.floor(points.min(0)-25)).astype(int);x1,y1=np.minimum([512,910],np.ceil(points.max(0)+25)).astype(int)
        Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).crop((x0,y0,x1,y1)).save(args.output/f"{prefix}-physical.png")
        comparisons.append(f'<article><h2>Mode {plan["mode"]} · {setting}, byte {byte} provisional</h2><p>Wall progression {wall:.2f}s after fitted reference origin. Factor before {old:.3f}; after {factor:.3f}. Optical frame {at}, t={at/fps:.3f}s. RGB brightness is camera-dependent; alignment is approximate.</p><div><figure><img src="{prefix}-physical.png"><figcaption>Physical recording</figcaption></figure><figure><img src="{prefix}-before.svg"><figcaption>Before: generic timing</figcaption></figure><figure><img src="{prefix}-after.svg"><figcaption>After: per-mode measured relative timing; original RGB frames</figcaption></figure></div></article>')
    print(json.dumps({"file":name,"mode":plan["mode"],"phase_intervals_s":medians,"factors":factors,"spatial_residuals":spatial}))

sheet=Image.new("RGB",(1100,285*len(panels)),"#101b2d");d=ImageDraw.Draw(sheet)
for i,(title,c,duration) in enumerate(panels):
    sheet.paste(Image.fromarray(c.transpose(1,0,2)).resize((1000,228),Image.Resampling.NEAREST),(45,i*285+28));d.text((8,i*285+7),title,fill="white")
    for z in range(19):d.text((8,i*285+28+z*12),str(z+1),fill="white")
    for t in range(0,int(duration)+1,2):d.text((45+int(t/duration*1000),i*285+260),str(t)+"s",fill="white")
sheet.save(args.output/"native-zone-timelines.png")
(args.output/"review.json").write_text(json.dumps(report,indent=2)+"\n")
(args.output/"comparison.html").write_text('<!doctype html><meta charset="utf-8"><title>Native Overlap timing comparison</title><style>body{background:#101b2d;color:#dbeaff;font:15px system-ui;margin:24px}article{border-top:1px solid #567;padding:12px}article div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}img{width:100%;max-height:300px;object-fit:contain}p,figcaption{color:#abc}</style><h1>Mode 7/8: physical frames and original SVG at matched progression</h1><p>Source geometry and RGB data are unchanged. Before/after differs only in the shared duration factor. Reference alignment uses lower-zone red fronts; it is not a BLE timestamp. Bytes are tentative.</p>'+''.join(comparisons),encoding="utf-8")
