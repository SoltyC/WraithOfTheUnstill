#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { snapshotFiles, planEdits, applyEdits } from './edits.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  root: { type: 'string' }, task: { type: 'string' }, file: { type: 'string', multiple: true },
  apply: { type: 'boolean', default: false }, 'runtime-root': { type: 'string', default: '/mnt/d/WraithLocalLLM' },
} });
const command = positionals[0], runtime = path.resolve(values['runtime-root']);
if (!['start','stop','status','edit'].includes(command)) throw new Error('Usage: worker.mjs start|stop|status|edit --task FILE --file PATH [--apply] [--root REPO]');
fs.mkdirSync(path.join(runtime, 'jobs'), { recursive: true });
fs.copyFileSync(new URL('./bridge.ps1', import.meta.url), path.join(runtime, 'bridge.ps1'));
const windows = name => execFileSync('wslpath', ['-w', name], { encoding: 'utf8' }).trim();
function bridge(action, args = []) {
  return execFileSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',windows(path.join(runtime,'bridge.ps1')),
    '-Action',action,'-Root',windows(runtime),...args], { encoding: 'utf8', timeout: 660_000, maxBuffer: 2_000_000 }).trim();
}
if (command !== 'edit') { console.log(bridge(command)); process.exit(0); }
if (!values.task) throw new Error('Provide a task text file');
const task = fs.readFileSync(values.task, 'utf8');
if (task.length > 6000) throw new Error('Use a small, specific task');
const snapshot = snapshotFiles(path.resolve(values.root || process.cwd()), values.file || []);
const job = path.join(runtime,'jobs',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID());
fs.mkdirSync(job);
const prompt = { task, files: [...snapshot.files].map(([name,f]) => ({ path: name, content: f.content })) };
const request = { model: 'local-coder', temperature: 0, max_tokens: 1800, stream: false, response_format: { type: 'json_object' }, messages: [
  { role: 'system', content: 'You implement one small coding task under a lead reviewer. Only edit assigned files. Preserve unrelated code and project style. Return ONLY a JSON object: {"summary":"short description","edits":[{"path":"exact assigned path","find":"literal unique existing text","replace":"replacement text"}]}. Each find must occur exactly once. For an empty assigned file, find may be empty. Never run commands, invent files, or propose changes outside the task. No Markdown fences.' },
  { role: 'user', content: JSON.stringify(prompt) },
] };
const requestPath = path.join(job,'request.json'), responsePath = path.join(job,'response.json');
fs.writeFileSync(requestPath,JSON.stringify(request));
bridge('request',['-RequestPath',windows(requestPath),'-ResponsePath',windows(responsePath)]);
const response = JSON.parse(fs.readFileSync(responsePath,'utf8').replace(/^\uFEFF/,''));
const proposal = JSON.parse(response.choices[0].message.content);
fs.writeFileSync(path.join(job,'proposal.json'),JSON.stringify(proposal,null,2)+'\n');
const planned = planEdits(snapshot,proposal);
if (values.apply) applyEdits(snapshot,planned);
console.log(JSON.stringify({ summary: proposal.summary, files: [...planned.keys()], applied: values.apply, usage: response.usage,
  timings: response.timings, job },null,2));
