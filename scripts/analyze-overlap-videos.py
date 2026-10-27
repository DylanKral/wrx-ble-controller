"""Measure visible color fronts, never BLE dispatch times. Source videos stay external.

Optional tooling: py -m pip install --target test-results/video-tools numpy opencv-python-headless pillow
"""
from pathlib import Path
import argparse
import csv
import hashlib
import json
import sys

sys.path.insert(0, str(Path("test-results/video-tools").resolve()))
import cv2
import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--videos", type=Path, required=True)
parser.add_argument("--output", type=Path, default=Path("docs/analysis/overlap"))
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)

# Analysis-only centers in frame 15 of each recording. Logical ordering follows
# the approved 19-zone path; these do not replace production LED mapping/data.
plans = {
    "IMG_1600.mp4": {
        "mode": 7,
        "direction": "lower inner (19) -> lower outer -> outside corner -> top inner (1)",
        "points": [(340,417),(308,414),(276,411),(245,409),(213,406),(182,403),(151,401),(155,428),(161,450),(178,473),(209,491),(238,505),(265,517),(291,528),(316,537),(340,546),(366,554),(393,562),(423,571)],
        "windows": [(3.8, 4.8), (10.0, 11.3)],
        "contact_times": [3.8667,4.0667,4.2667,4.4667,10.2333,10.4333,10.6333,10.8],
        "note": "Mixed/overexposed opening movement before ~3.8s is excluded from the steady-direction comparison; no mode-switch command is inferred.",
    },
    "IMG_1601.mp4": {
        "mode": 8,
        "direction": "top inner (1) -> top outer -> outside corner -> lower inner (19)",
        "points": [(347,432),(315,430),(282,426),(247,423),(212,420),(180,418),(149,415),(153,439),(160,461),(178,485),(210,504),(241,520),(270,532),(297,543),(323,552),(347,562),(373,571),(401,580),(432,589)],
        "windows": [(2.0, 3.1), (7.0, 8.2)],
        "contact_times": [2.2,2.4,2.6,2.7667,7.1667,7.3667,7.5667,7.7333],
        "note": "Two homologous red fronts; many sampled zones describe the same single repeat interval, not independent repeats.",
    },
}

report = {
    "native_speed_context": {"byte": 129, "source": "User confirmed 129 in both recordings; no synchronized BLE log or speed readout in footage."},
    "method": "Decode all frames. Track frame-15 analysis points with Lucas-Kanade features outside LEDs and RANSAC partial affine registration. Sample median RGB in 5x5 patches. Detect red onsets sustained >=3 frames at R>120 and R>ratio*G,B, for ratios 1.5/1.8/2.2. Match visually selected homologous wave windows, not Bluetooth events.",
    "preferred_retrigger_reference_ms": None,
    "decision": "Retain existing 3500ms Basic defaults; visible wave periods cannot establish a shorter app dispatch interval. Expose independent adjustable Basic reference intervals without rewriting native capture duration or Custom cuts.",
    "videos": {},
}
panels = []
records = json.loads(Path("Animations/wrx-basic-modes-final-calibrations.json").read_text())["records"]
for mode in (7, 8):
    rec = next(r for r in records if r["mode"] == mode)
    rgb = np.array([[[int(c[j:j+2], 16) for j in (1,3,5)] for c in frame["colors"]] for frame in rec["frames"]], dtype=np.uint8)
    panels.append((f"Approved Mode {mode}: {rec['cycleSeconds']:.2f}s observation window (unchanged)", rgb, rec["cycleSeconds"]))

for name, plan in plans.items():
    path = next(iter(args.videos.rglob(name)), None)
    if path is None:
        raise SystemExit(f"Missing source video: {name}")
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    declared_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 15)
    ok, ref = cap.read()
    if not ok:
        raise SystemExit(f"Cannot read reference frame: {path}")
    gray = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
    mask = np.zeros_like(gray)
    mask[300:730, 50:510] = 255
    mask[380:615, 115:470] = 0
    corners = cv2.goodFeaturesToTrack(gray, maxCorners=250, qualityLevel=.01, minDistance=8, mask=mask)
    points = np.array(plan["points"], dtype=np.float32)
    rows, sampled, registrations = [], [], []
    contact = Image.new("RGB", (4*320, 2*245), "#101b2d")
    contact_draw = ImageDraw.Draw(contact)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        i = len(rows)
        tracked, status, _ = cv2.calcOpticalFlowPyrLK(gray, cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), corners, None)
        good = status[:,0] == 1
        transform, inliers = cv2.estimateAffinePartial2D(corners[good], tracked[good], method=cv2.RANSAC, ransacReprojThreshold=2)
        if transform is None:
            raise SystemExit(f"Registration failed: {name} frame {i}")
        current = points @ transform[:,:2].T + transform[:,2]
        colors = []
        for x, y in current:
            x, y = round(float(x)), round(float(y))
            colors.append(np.median(frame[y-2:y+3, x-2:x+3], axis=(0,1))[::-1])
        rgb = np.array(colors, dtype=np.uint8)
        sampled.append(rgb)
        registrations.append(int(inliers.sum()))
        row = {"frame": i, "time_s": round(i/fps, 6), "pts_s": round(cap.get(cv2.CAP_PROP_POS_MSEC)/1000, 6), "registration_inliers": registrations[-1]}
        for zone, (r,g,b) in enumerate(rgb, 1):
            row.update({f"z{zone:02}_r": int(r), f"z{zone:02}_g": int(g), f"z{zone:02}_b": int(b)})
        rows.append(row)
        for cell, at in enumerate(plan["contact_times"]):
            if i == round(at*fps):
                im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                draw = ImageDraw.Draw(im)
                for index in (0, 18):
                    x, y = current[index]
                    draw.text((x+4,y-14), str(index+1), fill="lime")
                im = im.crop((110,385,460,610)).resize((310,200))
                x,y = (cell%4)*320,(cell//4)*245
                contact.paste(im,(x+5,y+27))
                contact_draw.text((x+5,y+6),f"{name} f{i} t={i/fps:.3f}s",fill="white")
        if i in (15, 150, 300):
            im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)); draw = ImageDraw.Draw(im)
            for zone, (x,y) in enumerate(current,1):
                draw.ellipse((x-3,y-3,x+3,y+3), outline="lime")
                draw.text((x+4,y-7),str(zone),fill="lime")
            im.crop((100,370,470,620)).save(args.output/f"{path.stem}-analysis-points-f{i}.png")
    cap.release()
    with (args.output/f"{path.stem}-zones.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
        writer.writeheader(); writer.writerows(rows)
    contact.save(args.output/f"{path.stem}-fronts.png")
    samples = np.array(sampled, dtype=float)
    checks = {}
    for ratio in (1.5, 1.8, 2.2):
        zone_events, periods, direction_delays = [], [], []
        for zone in range(19):
            r,g,b = samples[:,zone,:].T
            active = (r>120) & (r>ratio*g) & (r>ratio*b)
            starts = np.flatnonzero(active & ~np.r_[False, active[:-1]])
            starts = [int(j) for j in starts if active[j:j+3].sum() == 3]
            matched = [[j for j in starts if lo <= j/fps <= hi] for lo,hi in plan["windows"]]
            # Retain all candidates for inspection instead of hiding ambiguity.
            picks = [hits[0] if len(hits)==1 else None for hits in matched]
            interval = (picks[1]-picks[0])/fps if all(p is not None for p in picks) else None
            if interval is not None:
                periods.append(interval)
            zone_events.append({"zone": zone+1, "all_red_onsets_frames": starts, "matched_frames": picks, "visible_return_interval_s": interval})
        for wave in range(2):
            first, last = zone_events[0]["matched_frames"][wave], zone_events[-1]["matched_frames"][wave]
            direction_delays.append((last-first)/fps if first is not None and last is not None else None)
        checks[str(ratio)] = {"zones": zone_events, "median_visible_return_s": float(np.median(periods)), "visible_return_range_s": [min(periods),max(periods)], "zone19_minus_zone1_onset_s": direction_delays}
    report["videos"][name] = {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
        "width": ref.shape[1], "height": ref.shape[0], "fps": fps, "declared_frames": declared_count, "decoded_frames": len(rows), "duration_s": len(rows)/fps,
        "inferred_mode_from_steady_direction": plan["mode"], "direction": plan["direction"], "note": plan["note"],
        "analysis_reference_frame": 15, "analysis_points": plan["points"], "registration_inliers_range": [min(registrations), max(registrations)],
        "visually_selected_wave_windows_s": plan["windows"], "threshold_checks": checks,
        "uncertainty": "One clean homologous return interval per clip. Nominal one-frame 33.3ms sampling; allow at least +/- two frames (67ms) for intervals plus exposure, threshold, registration and unsynchronized-command uncertainty. These are optical color-front returns, not complete native duration or dispatch timing.",
    }
    panels.append((f"{name}: Mode {plan['mode']} steady direction; all {len(rows)} decoded frames", np.array(sampled), len(rows)/fps))

sheet = Image.new("RGB",(1060, len(panels)*285),"#101b2d"); draw=ImageDraw.Draw(sheet)
for i,(title,colors,duration) in enumerate(panels):
    sheet.paste(Image.fromarray(colors.transpose(1,0,2)).resize((1000,228),Image.Resampling.NEAREST),(45,i*285+28))
    draw.text((8,i*285+7),title,fill="white")
    for zone in range(19): draw.text((8,i*285+28+zone*12),str(zone+1),fill="white")
    for second in range(int(duration)+1): draw.text((45+round(1000*second/duration),i*285+259),str(second)+"s",fill="white")
sheet.save(args.output/"zone-timelines.png")
(args.output/"review.json").write_text(json.dumps(report,indent=2)+"\n")
for name,item in report["videos"].items():
    check=item["threshold_checks"]["1.8"]
    print(json.dumps({"file": name, "mode_from_direction":item["inferred_mode_from_steady_direction"], "visible_return_median_s":check["median_visible_return_s"], "visible_return_range_s":check["visible_return_range_s"], "zone19_minus_zone1_s":check["zone19_minus_zone1_onset_s"]}))
