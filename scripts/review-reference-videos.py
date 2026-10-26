from pathlib import Path
import sys, json, csv, argparse
sys.path.insert(0, str(Path('test-results/video-tools').resolve()))
import cv2
import numpy as np
from PIL import Image, ImageDraw

parser=argparse.ArgumentParser(description='Review original calibrated videos without changing source media or frame data.')
parser.add_argument('--videos',type=Path,required=True)
parser.add_argument('--output',type=Path,default=Path('docs/analysis'))
args=parser.parse_args()
source, output = args.videos, args.output
output.mkdir(parents=True, exist_ok=True)
tracks = json.loads(Path('Animations/wrx-basic-modes-final-calibrations.json').read_text())['records']
metadata = []
for video in sorted(source.rglob('*.mp4')):
    cap = cv2.VideoCapture(str(video))
    fps, count = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    metadata.append({'file':video.name, 'width':int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), 'height':int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), 'fps':fps, 'frames':count, 'duration_seconds': count/fps if fps else None})
    cap.release()

record = next(r for r in tracks if r['mode'] == 10)
video = next((path for path in source.rglob('*.mp4') if path.name==record['sourceFile']),source/record['sourceFile'])
if not video.is_file(): raise SystemExit(f'Original Mode 10 source not found: {video}')
cap = cv2.VideoCapture(str(video))
fps = cap.get(cv2.CAP_PROP_FPS)
points = [(int(x),int(y)) for x,y in record['points']]
trace = []
index = 0
while True:
    ok, frame = cap.read()
    if not ok: break
    channels = np.array([np.median(frame[max(0,y-3):y+4,max(0,x-3):x+4],axis=(0,1)) for x,y in points])
    trace.append({'frame':index,'time_seconds':index/fps,'mean_blue':float(channels[:,0].mean()),'mean_peak_rgb':float(channels.max(axis=1).mean())})
    index += 1
cap.release()
with (output/'mode10-original-intensity.csv').open('w',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=list(trace[0]));writer.writeheader();writer.writerows(trace)

start, end = record['startSeconds'], record['startSeconds']+record['cycleSeconds']
samples = np.array([r['mean_blue'] for r in trace])
smooth = np.convolve(np.pad(samples,(2,2),mode='edge'), np.ones(5)/5, mode='valid')
minima=[]
for i in range(1,len(smooth)-1):
    if smooth[i]<=smooth[i-1] and smooth[i]<smooth[i+1] and smooth[i]<np.percentile(smooth,35):
        if not minima or i-minima[-1]>=int(.4*fps): minima.append(i)
        elif smooth[i]<smooth[minima[-1]]: minima[-1]=i
review={'videos':metadata,'speed_clips_found':[m['file'] for m in metadata if m['file'].startswith(('IMG_1585','IMG_1586','IMG_1587'))],'mode10':{'file':video.name,'capture_start_seconds':start,'capture_end_seconds':end,'capture_seconds':record['cycleSeconds'],'capture_frames':len(record['frames']),'calibration_first_frame_mean_blue':float(np.mean([int(c[5:7],16) for c in record['frames'][0]['colors']])),'calibration_last_frame_mean_blue':float(np.mean([int(c[5:7],16) for c in record['frames'][-1]['colors']])),'candidate_low_brightness_times_seconds':[round(i/fps,4) for i in minima],'note':'Candidate minima are exploratory from original point samples, not a validated full-cycle or speed-byte measurement.'}}
(output/'reference-video-review.json').write_text(json.dumps(review,indent=2)+'\n')

times=[start-.5,start,start+.5,start+1,start+1.5,start+2,end,end+.5]
x0,y0=min(x for x,y in points)-18,min(y for x,y in points)-18
x1,y1=max(x for x,y in points)+18,max(y for x,y in points)+18
sheet=Image.new('RGB',(4*320,2*300),'#101b2d')
draw=ImageDraw.Draw(sheet)
cap=cv2.VideoCapture(str(video))
for i,t in enumerate(times):
    cap.set(cv2.CAP_PROP_POS_MSEC,t*1000)
    ok,frame=cap.read()
    if not ok: continue
    im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).crop((x0,y0,x1,y1))
    im.thumbnail((310,260))
    x,y=(i%4)*320,(i//4)*300
    sheet.paste(im,(x+(320-im.width)//2,y+28))
    draw.text((x+8,y+7),f'IMG_1573  t={t:.3f}s',fill='white')
cap.release()
sheet.save(output/'mode10-original-capture-contact.png')

# Independently decode the new clips. The supplied minima/windows guide local
# checks; they do not provide independently logged byte values.
speed_review={}
speed_contact=Image.new('RGB',(3*256,2*480),'#101b2d')
contact_draw=ImageDraw.Draw(speed_contact)
contact_plan=[('IMG_1585(1).mp4',6.3,'reference'),('IMG_1585(1).mp4',18.5,'slow'),('IMG_1585(1).mp4',39.0,'fast'),('IMG_1586(1).mp4',6.5,'reference'),('IMG_1587(1).mp4',10.0,'slow'),('IMG_1587(1).mp4',26.3,'fast')]
for filename in ['IMG_1585(1).mp4','IMG_1586(1).mp4','IMG_1587(1).mp4']:
    path=next((p for p in source.rglob('*.mp4') if p.name==filename),None)
    if path is None: continue
    cap=cv2.VideoCapture(str(path));fps=cap.get(cv2.CAP_PROP_FPS);rows=[];index=0
    while True:
        ok,frame=cap.read()
        if not ok: break
        roi=frame[425:615,205:500].astype(np.float32)
        blue,green,red=roi[:,:,0],roi[:,:,1],roi[:,:,2]
        hot=(red>150)&(red>1.3*green)&(red>1.3*blue)
        rows.append({'frame':index,'time_seconds':index/fps,'red_hot_pixels':int(hot.sum()),'mean_red':float(red.mean()),'mean_red_excess':float(np.maximum(0,red-(green+blue)/2).mean())})
        for cell,(planned_file,t,label) in enumerate(contact_plan):
            if planned_file==filename and index==round(t*fps):
                image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));image.thumbnail((256,455))
                x,y=(cell%3)*256,(cell//3)*480;speed_contact.paste(image,(x,y+24));contact_draw.text((x+3,y+6),f'{filename} {t:.1f}s {label}',fill='white')
        index+=1
    cap.release()
    with (output/(path.stem+'-red-intensity.csv')).open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    signal=np.array([r['red_hot_pixels'] for r in rows]);smooth=np.convolve(np.pad(signal,(1,1),mode='edge'),np.ones(3)/3,mode='valid')
    speed_review[filename]={'frames_decoded':len(rows),'fps':fps,'roi':[205,425,500,615],'hot_pixel_threshold':'R > 150 and R > 1.3*G and R > 1.3*B','note':'ROI/threshold checks do not establish exact speed bytes or hardware phase reset.'}
    if filename!='IMG_1585(1).mp4':
        groups={'reference':[2.10,5.63,9.20,12.73]} if '1586' in filename else {'slow':[8.67,14.97],'fast':[25.57,26.13,26.67,27.20]}
        speed_review[filename]['local_checks']={}
        for label,targets in groups.items():
            found=[]
            for target in targets:
                lo,hi=max(0,round((target-.2)*fps)),min(len(rows),round((target+.2)*fps)+1)
                candidates=np.flatnonzero(smooth[lo:hi]<=smooth[lo:hi].min()+1)
                picked=lo+int(candidates[len(candidates)//2]);found.append(round(picked/fps,6))
            speed_review[filename]['local_checks'][label]={'supplied_minima_seconds':targets,'locally_checked_minima_seconds':found,'successive_checked_intervals_seconds':[round(b-a,6) for a,b in zip(found,found[1:])]}
    else:
        groups=[(6,7.67),(11.30,13),(17.20,20.97),(25.10,28.90),(38.57,39.17),(42.97,43.57)]
        windows=[]
        for a,b in groups:
            lo,hi=max(0,round((a-.4)*fps)),min(len(rows),round((b+.4)*fps)+1)
            local=smooth[lo:hi];baseline=float(np.percentile(local,95));estimates={}
            for fraction in [.75,.85,.95]:
                below=np.flatnonzero(local<baseline*fraction)
                if len(below): estimates[str(fraction)]={'start_seconds':round((lo+int(below[0]))/fps,6),'end_seconds':round((lo+int(below[-1])+1)/fps,6),'duration_seconds':round((int(below[-1])-int(below[0])+1)/fps,6)}
            windows.append({'supplied_window':[a,b],'threshold_checks':estimates})
        speed_review[filename]['transition_threshold_checks']=windows
speed_contact.save(output/'native-speed-video-contact.png')
(output/'native-speed-video-review.json').write_text(json.dumps(speed_review,indent=2)+'\n')
print(json.dumps(review,indent=2))
print(json.dumps(speed_review,indent=2))
