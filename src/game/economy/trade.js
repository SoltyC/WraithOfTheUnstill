// Trade (docs §11.4): buy a trader's stock, sell materials and spare consumables back, and restock
// when the Wraith rests at a shrine. Pure over the inventory and a `test(condition)` from the quest
// graph (a stock line opens when its condition holds). Prices are fixed; weapons are never sold.

import { MATERIALS, CONSUMABLES, SELL_RATE } from './items.js';
import { TRADERS } from './traders.js';

/** @param {{ inventory: any, test: (c: any) => boolean }} ctx */
export function createTrade({ inventory, test }) {
  /** Copies in hand per trader and item. */
  const stock = {};
  for (const t in TRADERS) { stock[t] = {}; for (const l of TRADERS[t].stock) stock[t][l.id] = l.qty; }
  const self = {
    stock,
    /** The lines on offer: [{ id, name, price, qty, cap }] (open lines only). */
    lines(trader) {
      const out = [];
      for (const l of TRADERS[trader].stock) {
        if (l.when && !test(l.when)) continue;
        const c = CONSUMABLES[l.id];
        out.push({ id: l.id, name: c.name, text: c.text, price: c.price, qty: stock[trader][l.id], cap: l.qty, carried: inventory.count(l.id), room: c.cap });
      }
      return out;
    },
    /** Why a purchase cannot go ahead ('sold out' | 'pouch full' | 'marks' | 'closed'), or null. */
    buyBlock(trader, id) {
      const l = TRADERS[trader].stock.find((q) => q.id === id);
      if (!l || (l.when && !test(l.when))) return 'closed';
      const c = CONSUMABLES[id];
      if (stock[trader][id] <= 0) return 'sold out';
      if (inventory.count(id) >= c.cap) return 'pouch full';
      if (inventory.marks < c.price) return 'marks';
      return null;
    },
    /** Buy one. Returns null on success, else the reason. */
    buy(trader, id) {
      const why = self.buyBlock(trader, id);
      if (why) return why;
      inventory.spendMarks(CONSUMABLES[id].price); inventory.addItem(id, 1); stock[trader][id]--;
      return null;
    },
    /** What the traders pay for one of an item (materials: a share of value; consumables: `sell`). 0 = not bought. */
    sellPrice(id) {
      if (MATERIALS[id]) return Math.floor(MATERIALS[id].value * SELL_RATE);
      if (CONSUMABLES[id]) return CONSUMABLES[id].sell;
      return 0;
    },
    /** Items that can be sold now: [{ id, name, have, price }]. */
    sellable() {
      const out = [];
      for (const id in MATERIALS) if (inventory.materials[id] > 0) out.push({ id, name: MATERIALS[id].name, have: inventory.materials[id], price: self.sellPrice(id) });
      for (const id in CONSUMABLES) if (inventory.pouch[id] > 0) out.push({ id, name: CONSUMABLES[id].name, have: inventory.pouch[id], price: self.sellPrice(id) });
      return out;
    },
    /** Sell one; returns the marks paid (0 if there is none to sell). */
    sell(id) {
      const price = self.sellPrice(id);
      if (price <= 0) return 0;
      if (MATERIALS[id]) { if (inventory.materials[id] <= 0) return 0; inventory.materials[id]--; }
      else if (!inventory.consume(id)) return 0;
      inventory.addMarks(price); inventory.version++;
      return price;
    },
    /** A rest at a shrine: every line a copy fuller, up to what the trader began with. */
    restock() {
      for (const t in TRADERS) for (const l of TRADERS[t].stock) if (stock[t][l.id] < l.qty) stock[t][l.id]++;
    },
    serialize() { return JSON.parse(JSON.stringify(stock)); },
    restore(s) {
      for (const t in TRADERS) for (const l of TRADERS[t].stock) {
        const n = s && s[t] ? s[t][l.id] : undefined;
        stock[t][l.id] = Number.isFinite(n) ? Math.max(0, Math.min(l.qty, n | 0)) : l.qty;
      }
    },
  };
  return self;
}
