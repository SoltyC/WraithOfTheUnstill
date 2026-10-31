import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const inside = (root, target) => target.startsWith(root + path.sep);
function entryAt(name) {
  try { return fs.lstatSync(name); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function snapshotFiles(root, names) {
  root = fs.realpathSync(root);
  if (!names.length || names.length > 8) throw new Error('Select between one and eight files');
  const files = new Map();
  for (const name of names) {
    if (path.isAbsolute(name)) throw new Error('Use repository-relative file names');
    const full = path.resolve(root, name);
    const parent = fs.realpathSync(path.dirname(full));
    if (!inside(root, full) || !inside(root, path.join(parent, path.basename(full)))) throw new Error('File escapes workspace');
    const entry = entryAt(full), exists = !!entry;
    if (entry && !entry.isFile()) throw new Error('Select regular files');
    const content = exists ? fs.readFileSync(full, 'utf8') : '';
    if (Buffer.byteLength(content) > 24_000 || content.includes('\0')) throw new Error('Select small text files');
    const relative = path.relative(root, full).split(path.sep).join('/');
    files.set(relative, { full, parent, content, exists, hash: hash(content), mode: entry ? entry.mode : 0o644 });
  }
  if ([...files.values()].reduce((n, f) => n + f.content.length, 0) > 32_000) throw new Error('Task context is too large for the local worker');
  return { root, files };
}

export function planEdits(snapshot, response) {
  if (!Array.isArray(response.edits) || !response.edits.length || response.edits.length > 16) throw new Error('Expected one to sixteen edits');
  const planned = new Map();
  for (const edit of response.edits) {
    const original = snapshot.files.get(edit.path);
    if (!original) throw new Error('Model edited a file outside its assigned list: ' + edit.path);
    if (typeof edit.find !== 'string' || typeof edit.replace !== 'string') throw new Error('Edits require literal find/replace strings');
    const content = planned.get(edit.path) ?? original.content;
    const at = content.indexOf(edit.find);
    if (at < 0 || (edit.find === '' && content !== '') || (edit.find !== '' && content.lastIndexOf(edit.find) !== at)) throw new Error('Find text must match exactly once: ' + edit.path);
    const next = content.slice(0, at) + edit.replace + content.slice(at + edit.find.length);
    if (Buffer.byteLength(next) > 32_000) throw new Error('Generated file is too large');
    planned.set(edit.path, next);
  }
  return planned;
}

export function applyEdits(snapshot, planned) {
  // Validate all inputs before writing any file. A model response never carries authority
  // to overwrite edits that arrived while it was generating.
  for (const [name] of planned) {
    const f = snapshot.files.get(name);
    if (!f || !!entryAt(f.full) !== f.exists) throw new Error('File changed during generation: ' + name);
    const parent = fs.realpathSync(path.dirname(f.full));
    if (parent !== f.parent) throw new Error('Parent changed during generation');
    if (f.exists && (fs.lstatSync(f.full).isSymbolicLink() || hash(fs.readFileSync(f.full, 'utf8')) !== f.hash)) throw new Error('File changed during generation: ' + name);
  }
  const written = [], temps = [];
  try {
    for (const [name, content] of planned) {
      const f = snapshot.files.get(name), temp = f.full + '.local-llm-' + crypto.randomUUID();
      temps.push(temp); fs.writeFileSync(temp, content, { mode: f.mode, flag: 'wx' });
      fs.renameSync(temp, f.full); written.push(name);
    }
  } catch (error) {
    for (const name of written.reverse()) {
      const f = snapshot.files.get(name);
      if (hash(fs.readFileSync(f.full, 'utf8')) !== hash(planned.get(name))) continue;
      if (f.exists) fs.writeFileSync(f.full, f.content, { mode: f.mode }); else fs.unlinkSync(f.full);
    }
    throw error;
  } finally { for (const temp of temps) if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
