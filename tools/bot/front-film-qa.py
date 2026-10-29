from pathlib import Path
import json,sys
from PIL import Image

root=Path(sys.argv[1]);report=root/'docs/phase-9/storm-front/film.json'
data=json.loads(report.read_text())
prior=data.get('samples',[])
if prior and all(x.get('luma',0)==0 for x in prior):data['discardedBeforeRenderProbe']=prior
data['samples']=[]
for frame in range(0,720,60):
    image=Image.open(root/f'screenshots/d6-front-prototype/frames/front-arrival/f{frame:06d}.jpg').convert('RGB')
    assert image.size==(2560,1440),'Wrong native frame dimensions'
    roi=image.crop((1920,800,2560,1440));pixels=list(getattr(roi,'get_flattened_data',roi.getdata)())
    clipped=sum(max(rgb)>=253 for rgb in pixels)
    luma=sum(.2126*x[0]+.7152*x[1]+.0722*x[2] for x in pixels)/len(pixels)
    sample=dict(frame=frame,time=frame/60,foregroundPixels=len(pixels),foregroundClipped=clipped,maxRGB=max(max(x) for x in pixels),luma=luma)
    data['samples'].append(sample);print(frame,clipped,round(luma,3))
data['sampleSource']='Decoded native2560x1440 JPEGs captured immediately after render, not the discarded empty before-render canvas probe.'
data['note']='Native1440p/fixed60 12s arrival with incoming exposure settled first, then normal SH/eye adaptation.12exported-frame samples inspect a fixed640x640near-ground strip away from Wraith (RGB>=253), including frame0. JPEG artifact check, not raw-HDR/whole-frame opaque clipping or real-time performance. Full storm consumers unfinished and normal capability false.'
report.write_text(json.dumps(data,indent=2)+'\n')
assert len(data['samples'])==12 and all(s['luma']>0 for s in data['samples']),'Empty or missing frame samples'
assert not any(s['foregroundClipped'] for s in data['samples']),'Foreground clipping in exported film'
