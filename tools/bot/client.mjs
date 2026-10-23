// A tiny client for the bot bridge (src/core/bot.js): `await bot('walkTo', { x, z })`.
const base = process.env.WRAITH_URL || 'http://localhost:4173';
export async function bot(cmd, args = {}, wait = 180000) {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...args }) })).json();
  const r = await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=${wait}`);
  const out = await r.json();
  if (r.status !== 200 || out.ok === false) throw new Error(cmd + ' failed: ' + (out.error || r.status));
  return out;
}
export const js = (code) => bot('eval', { js: code }).then((o) => o.result);
