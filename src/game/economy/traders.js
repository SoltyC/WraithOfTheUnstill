// The Veiled who trade (docs §11.4): what each stocks, when a line opens (a quest condition, tested by
// the quest graph), how many they hold and what they pay. Prices are the items' (items.js): there is no
// haggling, no scaling and no random stock.

export const TRADERS = {
  corin: {
    name: 'Corin', place: 'Hearn',
    lines: 'What Hearn could save from the fire, and what Peg\'s oven and the lake-folk still make.',
    stock: [
      { id: 'salve', qty: 4 },
      { id: 'bread', qty: 3 },
      { id: 'tea', qty: 2, when: { quest: 'meadow-side-lamp' } },
      { id: 'draught', qty: 2, when: { quest: 'meadow-side-echoes' } },
      { id: 'tonic', qty: 2, when: { flag: 'meadow:bellwether-released' } },
    ],
  },
  osk: {
    name: 'Osk', place: 'the Pilgrims\' Fire',
    lines: 'Cold-road goods, carried on a sled from wherever the ice is thin.',
    stock: [
      { id: 'salve', qty: 4 },
      { id: 'tonic', qty: 3 },
      { id: 'tea', qty: 2, when: { flag: 'camp-hearth' } },
    ],
  },
};
