// Instant answers in Home's search: a calculator, unit and currency conversion, and emoji (type ":" then a word).
// The calculator is a small parser (numbers, + - × ÷ ^ %, brackets and a few functions), never eval.

// ---------- calculator ----------
const FN = { sqrt: Math.sqrt, sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180),
  log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil };
const CONST = { pi: Math.PI, π: Math.PI, e: Math.E };
function tokens(src) {
  const out = []; let i = 0;
  const s = src.replace(/[×x](?=\s*[\d(.])/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/\*\*/g, '^');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const word = /^[a-zπ]+/i.exec(s.slice(i));
    if (word) { const w = word[0].toLowerCase(); if (FN[w]) out.push({ t: 'f', v: w }); else if (w in CONST) out.push({ t: 'n', v: CONST[w] }); else return null; i += w.length; continue; }
    if ('+-*/^%()'.includes(c)) { out.push({ t: c }); i++; continue; }
    return null;
  }
  return out;
}
// recursive descent: expr = term (+|- term)*, term = factor (*|/ factor)*, factor = unary (^ factor)?, unary = -unary | postfix
function parse(tk) {
  let p = 0;
  const peek = () => tk[p], eat = (t) => (tk[p]?.t === t ? tk[p++] : null);
  function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; } }
  function term() { let v = factor(); for (;;) { if (eat('*')) v *= factor(); else if (eat('/')) v /= factor(); else if (peek()?.t === '(' || peek()?.t === 'f') v *= factor(); else return v; } } // 2(3+4), 2sqrt(9)
  function factor() { const b = unary(); return eat('^') ? b ** factor() : b; }
  function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return postfix(); }
  function postfix() { let v = atom(); while (eat('%')) v /= 100; return v; }
  function atom() {
    const t = tk[p++];
    if (!t) throw new Error('end');
    if (t.t === 'n') return t.v;
    if (t.t === 'f') { const arg = atom(); return FN[t.v](arg); }
    if (t.t === '(') { const v = expr(); if (!eat(')')) throw new Error(')'); return v; }
    throw new Error('token');
  }
  const v = expr();
  if (p !== tk.length) throw new Error('left over');
  return v;
}
export function calc(q) {
  let s = q.trim().replace(/=\s*$/, '');
  const pct = /^(\d+(?:\.\d+)?)\s*%\s*of\s*(.+)$/i.exec(s); // "15% of 80"
  if (pct) s = `${pct[1]}/100*(${pct[2]})`;
  if (!/[\d)]\s*[-+*/^%×÷x]|[a-z]+\s*\(|^\s*-?\d+(\.\d+)?\s*%\s*$|\bpi\b|π/i.test(s) && !pct) return null; // must look like a sum
  const tk = tokens(s);
  if (!tk || tk.length < 2) return null;
  try { const v = parse(tk); return Number.isFinite(v) ? v : null; } catch { return null; }
}
export const fmt = (v) => (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0) ? v.toExponential(6) : String(+v.toPrecision(12)));

// ---------- units ----------
const U = {}; // unit -> [kind, factor to base] (temperature handled apart)
const add = (kind, base, list) => { for (const [names, f] of list) for (const n of names.split('|')) U[n] = [kind, f]; void base; };
add('length', 'm', [['mm|millimeter|millimeters|millimetre|millimetres', 0.001], ['cm|centimeter|centimeters|centimetre|centimetres', 0.01], ['m|meter|meters|metre|metres', 1], ['km|kilometer|kilometers|kilometre|kilometres', 1000],
  ['in|inch|inches|"', 0.0254], ['ft|foot|feet|\'', 0.3048], ['yd|yard|yards', 0.9144], ['mi|mile|miles', 1609.344], ['nmi', 1852]]);
add('mass', 'kg', [['mg', 1e-6], ['g|gram|grams', 0.001], ['kg|kilo|kilos|kilogram|kilograms', 1], ['t|tonne|tonnes|ton|tons', 1000], ['oz|ounce|ounces', 0.028349523125], ['lb|lbs|pound|pounds', 0.45359237], ['st|stone|stones', 6.35029318]]);
add('volume', 'l', [['ml|milliliter|milliliters|millilitre|millilitres', 0.001], ['l|liter|liters|litre|litres', 1], ['tsp|teaspoon|teaspoons', 0.00492892], ['tbsp|tablespoon|tablespoons', 0.0147868],
  ['cup|cups', 0.24], ['floz', 0.0295735], ['pt|pint|pints', 0.568261], ['gal|gallon|gallons', 4.54609], ['usgal', 3.78541]]);
add('speed', 'm/s', [['m/s|mps', 1], ['km/h|kmh|kph', 1 / 3.6], ['mph', 0.44704], ['kn|knot|knots', 0.514444]]);
add('data', 'B', [['b|byte|bytes', 1], ['kb|kilobyte|kilobytes', 1e3], ['mb|megabyte|megabytes', 1e6], ['gb|gigabyte|gigabytes', 1e9], ['tb|terabyte|terabytes', 1e12], ['kib', 1024], ['mib', 1024 ** 2], ['gib', 1024 ** 3]]);
add('time', 's', [['ms', 0.001], ['s|sec|secs|second|seconds', 1], ['min|mins|minute|minutes', 60], ['h|hr|hrs|hour|hours', 3600], ['day|days', 86400], ['week|weeks', 604800], ['year|years|yr', 31557600]]);
add('area', 'm2', [['m2|sqm', 1], ['km2', 1e6], ['ha|hectare|hectares', 1e4], ['acre|acres', 4046.8564224], ['ft2|sqft', 0.09290304]]);
const TEMP = { c: 'c', '°c': 'c', celsius: 'c', f: 'f', '°f': 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };
const toC = (v, u) => (u === 'c' ? v : u === 'f' ? (v - 32) * 5 / 9 : v - 273.15), fromC = (v, u) => (u === 'c' ? v : u === 'f' ? v * 9 / 5 + 32 : v + 273.15);
const UNIT_RE = /^(-?[\d.,]+(?:\s*[-+*/^]\s*[\d.,]+)*)\s*([a-z°'"/2]+)\s+(?:to|in|into|as|=)\s+([a-z°'"/2]+)$/i;
/** "5 km to miles", "100 f in c", "2.5 gb to mb": { text, value } or null. Currencies: { currency: [from, to, amount] }. */
export function convert(q) {
  const m = UNIT_RE.exec(q.trim().toLowerCase());
  if (!m) return null;
  const amount = calc(m[1]) ?? parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  const a = m[2], b = m[3];
  if (TEMP[a] && TEMP[b]) { const v = fromC(toC(amount, TEMP[a]), TEMP[b]); return { value: v, text: `${fmt(amount)} °${TEMP[a].toUpperCase()} = ${fmt(+v.toFixed(2))} °${TEMP[b].toUpperCase()}` }; }
  if (U[a] && U[b] && U[a][0] === U[b][0]) { const v = amount * U[a][1] / U[b][1]; return { value: v, text: `${fmt(amount)} ${a} = ${fmt(+v.toPrecision(8))} ${b}` }; }
  if (/^[a-z]{3}$/.test(a) && /^[a-z]{3}$/.test(b)) return { currency: [a.toUpperCase(), b.toUpperCase(), amount] };
  return null;
}

// ---------- emoji ----------
// a few hundred everyday ones with words to find them by (Win+. has them all)
const E = `😀 grin smile happy|😂 joy laugh tears lol|🤣 rofl laugh|😊 blush smile|😍 love heart eyes|🥰 love hearts|😘 kiss|😎 cool sunglasses|🤔 think hmm|😐 neutral meh|🙄 eyeroll|😴 sleep tired zzz|😭 cry sob|😢 sad tear|😡 angry mad|🤯 mind blown|😱 scream shock|🥺 pleading puppy|😳 flushed|🤩 star struck wow|😇 angel innocent|🙃 upside down|😉 wink|😋 yum tasty|😜 tongue wink|🤪 zany crazy|🤗 hug|🤭 oops giggle|🤫 shh quiet|😬 grimace awkward|🥲 smile tear|😅 sweat smile|😆 laughing|🙂 slight smile|😶 speechless|🤐 zip|😷 mask sick|🤒 ill|🤮 vomit|🥵 hot|🥶 cold freezing|😈 devil|👻 ghost boo|💀 skull dead|👽 alien|🤖 robot|💩 poop|🤡 clown|😺 cat smile|🙈 see no evil monkey|👍 thumbs up yes ok|👎 thumbs down no|👌 ok perfect|✌️ peace victory|🤞 fingers crossed luck|🤟 love you|🤘 rock|👏 clap|🙌 raise hands praise|🙏 pray please thanks|💪 strong muscle flex|👋 wave hi bye|🤝 handshake deal|✍️ write|👀 eyes look|🧠 brain|❤️ heart love red|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|💔 broken heart|💕 hearts|✨ sparkles|⭐ star|🌟 glowing star|🔥 fire lit hot|💯 hundred perfect|💥 boom|💫 dizzy|💤 zzz sleep|💬 speech chat|🎉 party tada celebrate|🎊 confetti|🎂 cake birthday|🎁 gift present|🏆 trophy win|🥇 gold medal first|⚽ football soccer|🏀 basketball|🎮 game controller gaming|🕹️ joystick|🎧 headphones music|🎵 music note|🎶 notes music|🎤 mic sing|🎬 movie film|📷 camera photo|📱 phone mobile|💻 laptop computer|⌨️ keyboard|🖥️ desktop computer|🖱️ mouse|💾 save disk|📁 folder|📄 page document|📚 books study|📖 book read|✏️ pencil|📝 memo note|📌 pin|📎 paperclip|✂️ scissors|📅 calendar date|⏰ alarm clock|⌛ hourglass|🔔 bell notification|🔒 lock|🔑 key|💡 idea bulb|🔋 battery|🔌 plug|⚙️ gear settings|🛠️ tools|🧪 test|💊 pill|🏠 home house|🏫 school|🚗 car|🚀 rocket launch|✈️ plane flight|🚲 bike|🌍 earth world globe|🌙 moon night|☀️ sun sunny|⛅ cloudy|🌧️ rain|❄️ snow cold|⚡ lightning zap|🌈 rainbow|🌊 wave sea|🌸 blossom flower sakura|🌹 rose|🌻 sunflower|🍀 clover luck|🌲 tree|🍎 apple|🍕 pizza|🍔 burger|🍟 fries|🍜 ramen noodles|🍣 sushi|🍩 donut|🍪 cookie|🍫 chocolate|🍿 popcorn|☕ coffee|🍵 tea|🧋 bubble tea boba|🍺 beer|🥤 drink soda|🐶 dog puppy|🐱 cat kitty|🐼 panda|🦊 fox|🐰 rabbit bunny|🐻 bear|🐸 frog|🐧 penguin|🦄 unicorn|🐍 snake|🐉 dragon|🦋 butterfly|✅ check done yes|❌ cross no wrong|⚠️ warning|❓ question|❗ exclamation|➡️ right arrow|⬅️ left arrow|⬆️ up arrow|⬇️ down arrow|🔄 refresh repeat|➕ plus add|➖ minus|✖️ multiply|💲 dollar money|💰 money bag|💸 money flying|📈 chart up|📉 chart down|🇬🇧 uk britain flag|🇨🇳 china flag|🇺🇸 usa flag|🇯🇵 japan flag|🏳️‍🌈 rainbow flag|👑 crown king|💎 gem diamond|🎯 target|🧩 puzzle|🎲 dice|♟️ chess|🗿 moai|🫡 salute|🫠 melting|🫶 heart hands|🥳 party face|😤 huff triumph|😒 unamused|😔 pensive|😩 weary|🤓 nerd|🧐 monocle|😏 smirk|😌 relieved`.split('|').map((x) => { const i = x.indexOf(' '); return { e: x.slice(0, i), words: x.slice(i + 1) }; });
/** ":fire" -> matching emoji (all of them for ":" alone). */
export function emoji(q) {
  const m = /^:\s*(.*)$/.exec(q.trim());
  if (!m) return null;
  const w = m[1].toLowerCase();
  return (w ? E.filter((x) => x.words.split(' ').some((k) => k.startsWith(w)) || x.words.includes(w)) : E).slice(0, 96);
}
