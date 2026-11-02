#!/usr/bin/env python
# Generate music cues with ACE-Step 1.5 on the Windows GPU (docs/phase-10/local-music-generation.md).
#   tools/audio/ace/run.sh <cues.json> [out dir]     runs this inside C:\wraith-tools\ACE-Step-1.5
# cues.json: [{name, caption, seconds, seed, takes?, model?, steps?, lyrics?, src?, cover?, keyscale?, bpm?}]. No lyrics means instrumental. `src` with
# `cover` (0..1, how much of the source survives) reworks a source tune, which is how the stair song runs through the other cues.
import json, sys, time, shutil
from pathlib import Path
import torch
from acestep.handler import AceStepHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

# On a card over 8 GB ACE-Step encodes a source in 30 s chunks: with the model loaded that runs a 12 GB card out of memory, and its CPU offload crashes the same step, so everything stays on the GPU in shorter chunks.
tiled_encode = AceStepHandler.tiled_encode
AceStepHandler.tiled_encode = lambda self, audio, chunk_size=48000 * 12, overlap=None, offload_latent_to_cpu=True: tiled_encode(self, audio, chunk_size, overlap, offload_latent_to_cpu)

cues = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
root = str(Path.cwd())
dit, loaded = AceStepHandler(), None
for cue in cues:
    model = cue.get('model', 'acestep-v15-turbo')
    if model != loaded:
        t = time.time()
        print('load', model, dit.initialize_service(project_root=root, config_path=model, device='cuda', offload_to_cpu=False, quantization=None), flush=True)
        print('loaded in', round(time.time() - t, 1), 's', flush=True)
        loaded = model
    turbo = 'turbo' in model
    p = GenerationParams(
        task_type='cover' if cue.get('src') else 'text2music', src_audio=cue.get('src'), audio_cover_strength=cue.get('cover', 1.0),
        caption=cue['caption'], lyrics=cue.get('lyrics', '[Instrumental]'), instrumental='lyrics' not in cue,
        vocal_language=cue.get('language', 'en' if 'lyrics' in cue else 'unknown'), duration=cue['seconds'], seed=cue.get('seed', 1),
        bpm=cue.get('bpm'), keyscale=cue.get('keyscale', ''), inference_steps=cue.get('steps', 8 if turbo else 50), thinking=False,
    )
    g = GenerationConfig(batch_size=cue.get('takes', 1), audio_format='wav', use_random_seed=False, seeds=[cue.get('seed', 1) + k for k in range(cue.get('takes', 1))])
    torch.cuda.reset_peak_memory_stats()
    t = time.time()
    r = generate_music(dit, None, p, g, save_dir=str(out / '_raw'))
    took = time.time() - t
    if not r.success:
        print('FAILED', cue['name'], r.error, flush=True)
        continue
    for k, a in enumerate(r.audios):
        dst = out / f"{cue['name']}-{k + 1}.wav"
        shutil.move(a['path'], dst)
        print('wrote', dst.name, 'seed', a['params'].get('seed'), flush=True)
    print(json.dumps({'cue': cue['name'], 'model': model, 'seconds': cue['seconds'], 'took': round(took, 1), 'peakGB': round(torch.cuda.max_memory_allocated() / 2**30, 2)}), flush=True)
