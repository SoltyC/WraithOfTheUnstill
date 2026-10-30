import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotFiles, planEdits, applyEdits } from '../tools/local-llm/edits.mjs';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'wraith-local-'));
  try { fs.writeFileSync(path.join(root,'a.js'),'const a = 1;\n'); fs.writeFileSync(path.join(root,'b.js'),'const b = 2;\n'); run(root); }
  finally { fs.rmSync(root,{recursive:true,force:true}); }
}
describe('guided local edits',()=>{
  it('applies literal changes only to assigned files',()=>fixture(root=>{
    const snapshot=snapshotFiles(root,['a.js']);
    applyEdits(snapshot,planEdits(snapshot,{edits:[{path:'a.js',find:'a = 1',replace:'a = 3'}]}));
    expect(fs.readFileSync(path.join(root,'a.js'),'utf8')).toBe('const a = 3;\n');
    expect(()=>planEdits(snapshot,{edits:[{path:'b.js',find:'b = 2',replace:'b = 4'}]})).toThrow(/outside/);
  }));
  it('rejects workspace escapes, symlinks and ambiguous replacements',()=>fixture(root=>{
    expect(()=>snapshotFiles(root,['../outside.js'])).toThrow();
    fs.symlinkSync(path.join(root,'a.js'),path.join(root,'link.js'));
    expect(()=>snapshotFiles(root,['link.js'])).toThrow();
    fs.symlinkSync('/does-not-exist',path.join(root,'broken.js'));
    expect(()=>snapshotFiles(root,['broken.js'])).toThrow();
    const snapshot=snapshotFiles(root,['a.js']);
    expect(()=>planEdits(snapshot,{edits:[{path:'a.js',find:' ',replace:''}]})).toThrow(/exactly once/);
  }));
  it('preflights every file before mutating any stale input',()=>fixture(root=>{
    const snapshot=snapshotFiles(root,['a.js','b.js']);
    const plan=planEdits(snapshot,{edits:[{path:'a.js',find:'1',replace:'3'},{path:'b.js',find:'2',replace:'4'}]});
    fs.writeFileSync(path.join(root,'b.js'),'user edit');
    expect(()=>applyEdits(snapshot,plan)).toThrow(/changed/);
    expect(fs.readFileSync(path.join(root,'a.js'),'utf8')).toBe('const a = 1;\n');
    expect(fs.readFileSync(path.join(root,'b.js'),'utf8')).toBe('user edit');
  }));
  it('supports an explicitly assigned new file',()=>fixture(root=>{
    const snapshot=snapshotFiles(root,['new.js']);
    applyEdits(snapshot,planEdits(snapshot,{edits:[{path:'new.js',find:'',replace:'export const value = 1;\n'}]}));
    expect(fs.readFileSync(path.join(root,'new.js'),'utf8')).toContain('value = 1');
  }));
  it('rolls back earlier writes if a later rename fails',()=>fixture(root=>{
    const snapshot=snapshotFiles(root,['a.js','b.js']);
    const plan=planEdits(snapshot,{edits:[{path:'a.js',find:'1',replace:'3'},{path:'b.js',find:'2',replace:'4'}]});
    const rename=fs.renameSync;
    const mock=vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{
      if(to.endsWith('b.js'))throw new Error('simulated write failure');
      return rename(from,to);
    });
    try { expect(()=>applyEdits(snapshot,plan)).toThrow(/simulated/); }
    finally { mock.mockRestore(); }
    expect(fs.readFileSync(path.join(root,'a.js'),'utf8')).toBe('const a = 1;\n');
    expect(fs.readFileSync(path.join(root,'b.js'),'utf8')).toBe('const b = 2;\n');
    expect(fs.readdirSync(root).sort()).toEqual(['a.js','b.js']);
  }));
});
