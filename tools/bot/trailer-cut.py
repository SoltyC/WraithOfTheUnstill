#!/usr/bin/env python3
"""Cut the trailer from the filmed shots (tools/bot/trailer.mjs) with the Windows ffmpeg.

  python3 tools/bot/trailer-cut.py

Each shot's frames → screenshots/trailer/clips/<name>.mp4 (60 fps, x264), then the cut: crossfades between
shots, a few lines of text over them, an end card, and the release theme (assets/audio/music/release.wav)
under it all → screenshots/trailer/wraith-trailer.mp4.
"""
import os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FF = '/mnt/c/ffmpeg/bin/ffmpeg.exe'
T = os.path.join(ROOT, 'screenshots', 'trailer')
win = lambda p: subprocess.check_output(['wslpath', '-w', p]).decode().strip()

# (shot, seconds used from its start, line of text over it or None)
CUT = [
    ('s01-meadow', 6.5, 'The meadow holds its breath.'),
    ('s02-lake', 5.5, None),
    ('s03-forest', 4.5, None),
    ('s04-blizzard', 4.0, None),
    ('s05-warden', 5.0, 'The frost was only the beginning.'),
    ('s06-village-aerial', 5.5, None),
    ('s07-fire-night', 5.5, 'Hearn is burning.'),
    ('s08-ribbon', 4.5, None),
    ('s09-stair', 5.0, None),
    ('s10-wake-market', 6.0, 'Something sleeps under the manor.'),
    ('s12-neck', 3.2, None),
    ('s13-release', 12.0, 'Let it breathe.'),
    ('s14-mill', 6.0, None),
    ('s16-summit', 8.5, None),
]
XF = 0.6          # crossfade (s)
END = 5.0         # end card (s)
FONT = 'C\\:/Windows/Fonts/georgia.ttf'

def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-2000:])

os.makedirs(os.path.join(T, 'clips'), exist_ok=True)
shots = []
for name, secs, text in CUT:
    fr = os.path.join(T, 'frames', name)
    if not os.path.isdir(fr): print('missing', name); continue
    mp4 = os.path.join(T, 'clips', name + '.mp4')
    if not os.path.exists(mp4) or os.path.getmtime(mp4) < os.path.getmtime(fr):
        run([FF, '-v', 'error', '-y', '-framerate', '60', '-i', win(fr) + '\\f%06d.jpg', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', win(mp4)])
        print('clip', name)
    n = len(os.listdir(fr))
    shots.append((mp4, min(secs, n / 60), text))

# The cut: trim each clip, overlay its line (fading in and out), crossfade into the next; then the end card.
inputs, parts = [], []
for k, (mp4, secs, text) in enumerate(shots):
    inputs += ['-i', win(mp4)]
    f = f'[{k}:v]trim=0:{secs:.3f},setpts=PTS-STARTPTS,fps=60,settb=1/60,format=yuv420p'
    if text:
        t0, t1 = 0.8, secs - 0.9
        alpha = f"if(lt(t,{t0}),0,if(lt(t,{t0 + 0.6}),(t-{t0})/0.6,if(lt(t,{t1 - 0.6}),1,if(lt(t,{t1}),({t1}-t)/0.6,0))))"
        f += (f",drawtext=fontfile='{FONT}':text='{text}':fontsize=46:fontcolor=white:alpha='{alpha}'"
              f":x=(w-text_w)/2:y=h*0.80:box=1:boxcolor=black@0.35:boxborderw=16")
    parts.append(f + f'[v{k}]')
# End card: black, the title, then fade.
endk = len(shots)
inputs += ['-f', 'lavfi', '-t', str(END), '-i', 'color=c=black:s=1920x1080:r=60']
parts.append(f"[{endk}:v]format=yuv420p,drawtext=fontfile='{FONT}':text='WRAITH OF THE UNSTILL':fontsize=78:fontcolor=white:"
             f"alpha='if(lt(t,0.6),0,if(lt(t,1.6),t-0.6,if(lt(t,{END - 1.2}),1,max(0,({END}-t)/1.2))))':x=(w-text_w)/2:y=(h-text_h)/2,"
             f"fps=60,settb=1/60[v{endk}]")
acc, length = 'v0', shots[0][1]
for k in range(1, endk + 1):
    d = shots[k][1] if k < endk else END
    off = length - XF
    parts.append(f'[{acc}][v{k}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{k}]')
    acc, length = f'x{k}', off + d
# Music: the release theme from the start, faded out with the end card.
music = os.path.join(ROOT, 'assets', 'audio', 'music', 'release.wav')
inputs += ['-i', win(music)]
ak = endk + 1
parts.append(f'[{ak}:a]atrim=0:{length:.3f},afade=t=in:d=1.5,afade=t=out:st={length - 3.5:.3f}:d=3.5[a]')
out = os.path.join(T, 'wraith-trailer.mp4')
run([FF, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(parts), '-map', f'[{acc}]', '-map', '[a]',
     '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', win(out)])
print(f'trailer: {out} ({length:.1f} s)')
