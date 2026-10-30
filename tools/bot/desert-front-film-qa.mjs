import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const python=process.env.WRAITH_PYTHON||'python3';
const native=p=>process.platform!=='win32'&&/\.exe$/i.test(python)?execFileSync('wslpath',['-w',path.resolve(p)],{encoding:'utf8'}).trim():path.resolve(p);
export function checkFilmQaRuntime(){try{execFileSync(python,['-c','import PIL'],{stdio:'pipe'});}catch{throw new Error('Set WRAITH_PYTHON to a Python executable with Pillow for exported native-frame QA.');}}
export function verifyFrontFilm(report="docs/phase-9/storm-front/film.json",frames="screenshots/d6-front-prototype/frames/front-arrival",count=720){execFileSync(python,[native('tools/bot/front-film-qa.py'),native('.'),report,frames,String(count)],{stdio:'inherit'});}
if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){checkFilmQaRuntime();verifyFrontFilm();}
