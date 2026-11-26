// てんき服 — Open-Meteo の気象データから服装を提案する
'use strict';

const PRESETS = [
  { name: '札幌', admin: '北海道', lat: 43.0642, lon: 141.3469 },
  { name: '仙台', admin: '宮城県', lat: 38.2682, lon: 140.8694 },
  { name: '東京', admin: '東京都', lat: 35.6895, lon: 139.6917 },
  { name: '名古屋', admin: '愛知県', lat: 35.1815, lon: 136.9066 },
  { name: '大阪', admin: '大阪府', lat: 34.6937, lon: 135.5023 },
  { name: '広島', admin: '広島県', lat: 34.3853, lon: 132.4553 },
  { name: '福岡', admin: '福岡県', lat: 33.5902, lon: 130.4017 },
  { name: '那覇', admin: '沖縄県', lat: 26.2124, lon: 127.6809 },
];

// 花粉データ（ウェザーニューズ）を取る地点：各都道府県の県庁所在地の市区町村コード
const POLLEN_CITY = {
  北海道: '01101', 青森県: '02201', 岩手県: '03201', 宮城県: '04101', 秋田県: '05201', 山形県: '06201', 福島県: '07201',
  茨城県: '08201', 栃木県: '09201', 群馬県: '10201', 埼玉県: '11107', 千葉県: '12101', 東京都: '13101', 神奈川県: '14104',
  新潟県: '15103', 富山県: '16201', 石川県: '17201', 福井県: '18201', 山梨県: '19201', 長野県: '20201', 岐阜県: '21201',
  静岡県: '22101', 愛知県: '23106', 三重県: '24201', 滋賀県: '25201', 京都府: '26104', 大阪府: '27127', 兵庫県: '28110',
  奈良県: '29201', 和歌山県: '30201', 鳥取県: '31201', 島根県: '32201', 岡山県: '33101', 広島県: '34101', 山口県: '35203',
  徳島県: '36201', 香川県: '37201', 愛媛県: '38201', 高知県: '39201', 福岡県: '40133', 佐賀県: '41201', 長崎県: '42201',
  熊本県: '43101', 大分県: '44201', 宮崎県: '45201', 鹿児島県: '46201', 沖縄県: '47201',
};

// WMO 天気コード → 日本語 + アイコン
const WEATHER = {
  0: ['快晴', '☀️'], 1: ['晴れ', '🌤️'], 2: ['くもり時々晴れ', '⛅'], 3: ['くもり', '☁️'],
  45: ['霧', '🌫️'], 48: ['霧（着氷）', '🌫️'],
  51: ['弱い霧雨', '🌦️'], 53: ['霧雨', '🌦️'], 55: ['強い霧雨', '🌧️'],
  56: ['着氷性の霧雨', '🌧️'], 57: ['着氷性の霧雨', '🌧️'],
  61: ['小雨', '🌦️'], 63: ['雨', '🌧️'], 65: ['大雨', '🌧️'],
  66: ['着氷性の雨', '🌧️'], 67: ['着氷性の強い雨', '🌧️'],
  71: ['小雪', '🌨️'], 73: ['雪', '🌨️'], 75: ['大雪', '❄️'], 77: ['霧雪', '🌨️'],
  80: ['にわか雨', '🌦️'], 81: ['にわか雨', '🌧️'], 82: ['激しいにわか雨', '⛈️'],
  85: ['にわか雪', '🌨️'], 86: ['強いにわか雪', '❄️'],
  95: ['雷雨', '⛈️'], 96: ['雷雨（ひょう）', '⛈️'], 99: ['激しい雷雨（ひょう）', '⛈️'],
};
const weatherOf = (code) => WEATHER[code] || ['不明', '❔'];
const isSnow = (code) => [71, 73, 75, 77, 85, 86].includes(code);
const isWet = (code) => code >= 51; // 霧雨・雨・雪・雷雨

// 体感最高気温ベースの服装ランク（上から順に判定）。fig はイラストの着せ方
const OUTFITS = [
  { min: 30, icon: '🎽', title: 'ノースリーブ・半袖', detail: '真夏日。通気性のよい薄手の服で。', fig: { top: 'tank', bottom: 'shorts' } },
  { min: 25, icon: '👕', title: '半袖', detail: '半袖Tシャツで快適。冷房対策に薄手の羽織があると安心。', fig: { top: 'tee' } },
  { min: 21, icon: '👔', title: '長袖シャツ・薄手', detail: '長袖シャツやカットソー1枚でちょうどいい気温。', fig: { top: 'long' } },
  { min: 17, icon: '🧥', title: 'カーディガン・薄手の羽織', detail: '長袖に軽い羽織りを。日なたでは脱げるものが便利。', fig: { top: 'long', outer: 'cardigan' } },
  { min: 13, icon: '🧶', title: 'セーター・ジャケット', detail: 'ニットやジャケットなど、しっかりした長袖を。', fig: { top: 'long', outer: 'jacket' } },
  { min: 9,  icon: '🧥', title: 'トレンチコート・薄手のコート', detail: 'コートが必要。インナーは長袖＋ニットで。', fig: { top: 'long', outer: 'trench' } },
  { min: 5,  icon: '🧥', title: '冬物コート', detail: 'ウールコートなど厚手のアウターを。首元も温かく。', fig: { top: 'long', outer: 'coat', scarf: true } },
  { min: -Infinity, icon: '🧣', title: 'ダウン・マフラー・手袋', detail: '真冬の寒さ。ダウンに防寒小物をフル装備で。', fig: { top: 'long', outer: 'down', scarf: true, gloves: true, hat: 'knit' } },
];

// ---------- 保存（ブラウザ内） ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`tenki-fuku:${key}`);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`tenki-fuku:${key}`, JSON.stringify(value)); } catch { /* 保存できない環境 */ }
  },
};

// offset: 暑がり(+)・寒がり(-)の補正℃ / start,end: 外出時間（時） / notify,notifyH: 前日のお知らせ
const settings = Object.assign({ offset: 0, start: 8, end: 19, notify: false, notifyH: 21 }, store.get('settings', {}));
let favorites = store.get('favorites', []);
let state = null; // { place, data, air, pollen }
let viewDay = 0;  // 0: 今日 / 1: 明日

const placeKey = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
const isFavorite = (p) => favorites.some((f) => placeKey(f) === placeKey(p));

// ---------- 判定ロジック ----------
const outfitFor = (feel) => OUTFITS.find((o) => feel >= o.min);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const inWindow = (t, date, startH, endH) => {
  const h = Number(t.slice(11, 13));
  return t.startsWith(date) && h >= startH && h <= endH;
};

// 指定日の startH〜endH 時の予報をまとめる
function windowStats(hourly, date, startH, endH) {
  const idx = [];
  hourly.time.forEach((t, i) => { if (inWindow(t, date, startH, endH)) idx.push(i); });
  if (idx.length === 0) return null;
  const pick = (k) => idx.map((i) => hourly[k][i]).filter((v) => v != null);
  const feel = pick('apparent_temperature');
  const temp = pick('temperature_2m');
  const pop = pick('precipitation_probability');
  const wind = pick('wind_speed_10m');
  return {
    feelMax: Math.max(...feel), feelMin: Math.min(...feel),
    tMax: Math.max(...temp), tMin: Math.min(...temp),
    pop: pop.length ? Math.max(...pop) : 0,
    wind: wind.length ? Math.max(...wind) : 0,
    humAvg: avg(pick('relative_humidity_2m')),
    codes: pick('weather_code'),
  };
}

// 洗濯の目安（9〜15時の予報で判定）
function laundryFor(w) {
  if (!w) return null;
  if (w.pop >= 50 || w.codes.some(isWet)) return { mark: '×', label: '部屋干し推奨', text: '雨や雪の可能性が高いので部屋干しに。' };
  if (w.pop >= 30 || w.humAvg >= 75 || w.tMax < 8) return { mark: '△', label: '乾きにくい', text: '薄手なら外干しできますが、厚手は部屋干しが安心。' };
  if (w.humAvg < 60 && (w.wind >= 3 || w.codes.every((c) => c <= 1))) return { mark: '◎', label: 'よく乾く', text: '絶好の洗濯日和。厚手のものもよく乾きます。' };
  return { mark: '○', label: '乾く', text: '外干しで乾きます。' };
}

// daily の i 日目について、外出時間帯の予報をまとめる
function dayData(data, i) {
  const { daily, hourly } = data;
  const date = daily.time[i];
  const w = windowStats(hourly, date, settings.start, settings.end) || {
    feelMax: daily.apparent_temperature_max[i], feelMin: daily.apparent_temperature_min[i],
    tMax: daily.temperature_2m_max[i], tMin: daily.temperature_2m_min[i],
    pop: daily.precipitation_probability_max[i] ?? 0, wind: daily.wind_speed_10m_max[i] ?? 0,
    humAvg: 0, codes: [],
  };
  return {
    ...w,
    date,
    code: daily.weather_code[i],
    dayMax: daily.temperature_2m_max[i],
    dayMin: daily.temperature_2m_min[i],
    uv: daily.uv_index_max[i] ?? 0,
    snow: isSnow(daily.weather_code[i]) || w.codes.some(isSnow),
    outfit: outfitFor(w.feelMax + settings.offset),
    laundry: laundryFor(windowStats(hourly, date, 9, 15)),
  };
}

function buildAdvice(d) {
  const tips = [];

  const diff = d.tMax - d.tMin;
  if (diff >= 8) {
    tips.push(`🌡️ 外出中の寒暖差が ${diff.toFixed(0)}℃ あります。脱ぎ着しやすい重ね着を。`);
  } else if (d.feelMin < d.feelMax - 6 && d.feelMin < 15) {
    tips.push('🌙 朝晩は冷えます。羽織るものを1枚持っていきましょう。');
  }

  if (d.snow) tips.push('⛄ 雪の可能性。滑りにくい靴と防水のアウターを。');
  if (d.pop >= 50) tips.push(`☔ 外出中の降水確率 ${d.pop}%。傘を持って出かけましょう。`);
  else if (d.pop >= 30) tips.push(`🌂 外出中の降水確率 ${d.pop}%。折りたたみ傘があると安心。`);

  if (d.wind >= 10) tips.push(`🌬️ 風が強い（最大 ${d.wind.toFixed(0)}m/s）。体感はさらに低め、風を通さないアウターを。`);
  else if (d.wind >= 7) tips.push(`🍃 やや風が強め（最大 ${d.wind.toFixed(0)}m/s）。帽子やスカートは注意。`);

  if (d.uv >= 8) tips.push(`🕶️ 紫外線が非常に強い（UV ${d.uv.toFixed(0)}）。日焼け止め・帽子・サングラスを。`);
  else if (d.uv >= 6) tips.push(`🧴 紫外線が強め（UV ${d.uv.toFixed(0)}）。日焼け止めを忘れずに。`);

  if (d.feelMax >= 31) tips.push('💧 熱中症に注意。こまめな水分補給を。');
  if (d.feelMin <= 0) tips.push('🧤 氷点下の冷え込み。手袋・ニット帽で末端を守りましょう。');

  if (tips.length === 0) tips.push('😊 特に注意点はありません。過ごしやすい一日です。');
  return tips;
}

// 前の日との比較（外出時間帯の体感最高気温どうし）。label は「昨日」「今日」
function compareText(day, prev, label) {
  if (!prev) return '';
  const diff = Math.round(day.feelMax - prev.feelMax);
  if (diff <= -5) return `${label}より体感が ${-diff}℃ 低い。かなり寒く感じます。${label}より厚手の服を。`;
  if (diff <= -2) return `${label}より体感が ${-diff}℃ 低い。${label}より1枚多めに。`;
  if (diff >= 5) return `${label}より体感が ${diff}℃ 高い。${label}よりだいぶ薄着でOK。`;
  if (diff >= 2) return `${label}より体感が ${diff}℃ 高い。${label}より1枚少なめでOK。`;
  return `${label}とほぼ同じ体感。${label}と同じくらいの服装で大丈夫です。`;
}

// ---------- 空気（PM2.5・黄砂・花粉） ----------
// 外出時間帯の PM2.5（平均）と黄砂（最大）
function dayAir(air, date) {
  if (!air) return null;
  const pm = [];
  const dust = [];
  air.time.forEach((t, i) => {
    if (!inWindow(t, date, settings.start, settings.end)) return;
    if (air.pm2_5[i] != null) pm.push(air.pm2_5[i]);
    if (air.dust[i] != null) dust.push(air.dust[i]);
  });
  if (!pm.length && !dust.length) return null;
  return { pm25: pm.length ? avg(pm) : null, dust: dust.length ? Math.max(...dust) : null };
}

// 目安（PM2.5 は環境基準の日平均 35µg/m³ を境に）
const pmLevel = (v) => (v <= 15 ? ['良い', 0] : v <= 35 ? ['普通', 0] : v <= 70 ? ['やや多い', 1] : ['多い', 2]);
const dustLevel = (v) => (v < 20 ? ['ほぼなし', 0] : v < 50 ? ['少し', 0] : v < 100 ? ['やや多い', 1] : ['多い', 2]);
const pollenLevel = (v) => (v < 10 ? ['少ない', 0] : v < 30 ? ['やや多い', 1] : v < 50 ? ['多い', 2] : v < 100 ? ['非常に多い', 2] : ['極めて多い', 2]);

// マスクをすすめる理由
function maskReasons(air, pollen) {
  const r = [];
  if (pollen?.status === 'ok' && pollen.max >= 30) r.push('花粉');
  if (air?.pm25 > 35) r.push('PM2.5');
  if (air?.dust >= 50) r.push('黄砂');
  return r;
}

// ---------- 持ち物 ----------
function buildItems(d, mask) {
  const items = [];
  const add = (id, icon, name, why) => items.push({ id, icon, name, why });
  const feel = d.feelMax + settings.offset; // 服に関わるものは暑がり・寒がりを反映

  if (d.pop >= 50) add('umbrella', '☂️', '傘', `降水確率 ${d.pop}%`);
  else if (d.pop >= 30) add('folding', '🌂', '折りたたみ傘', `降水確率 ${d.pop}%`);
  if (d.snow) add('boots', '🥾', '滑りにくい靴', '雪の可能性');

  const swing = d.tMax - d.tMin >= 8 || (d.feelMin < d.feelMax - 6 && d.feelMin < 15);
  if (swing && feel >= 13) add('layer', '🧥', '脱ぎ着できる羽織', '寒暖差が大きい');
  if (feel >= 27) add('aircon', '👚', '冷房対策の薄手の羽織', '室内は冷えることも');

  if (d.feelMax >= 26) add('drink', '🥤', '飲み物', '汗をかく暑さ');
  if (d.feelMax >= 31) add('cool', '🧊', '冷感グッズ（扇子・ハンディファン）', '熱中症対策');
  if (d.uv >= 6) add('sunscreen', '🧴', '日焼け止め', `UV ${Math.round(d.uv)}`);
  if (d.uv >= 8) {
    add('hat', '🧢', '帽子', `UV ${Math.round(d.uv)}`);
    add('sunglasses', '🕶️', 'サングラス', `UV ${Math.round(d.uv)}`);
  }

  if (feel < 9) add('scarf', '🧣', 'マフラー', '首元の防寒');
  if (d.feelMin <= 3) add('gloves', '🧤', '手袋', `体感 最低 ${fmt(d.feelMin)}`);
  if (d.feelMin <= 0) add('kairo', '🔥', 'カイロ', '氷点下の冷え込み');
  if (d.humAvg > 0 && d.humAvg < 45 && d.feelMax < 15) add('lip', '💧', 'リップ・ハンドクリーム', `乾燥（湿度 ${Math.round(d.humAvg)}%）`);
  if (mask.length) add('mask', '😷', 'マスク', `${mask.join('・')}が多め`);
  return items;
}

// ---------- 服装のイラスト（SVG） ----------
// 座標は幅160の枠で、x=80 が体の中心。左半身の形を描き、右半身は左右反転して描く
const SKIN = '#f1c7a5';
const SKIN_SHADE = '#d9a582';
const CLOTH = {
  tank: '#e9735a', tee: '#4f8fd9', long: '#f4f5f7', pants: '#3f5379', shorts: '#8fa3c4',
  cardigan: '#c8955f', jacket: '#6f7f55', trench: '#c9aa7a', coat: '#3d4c6e', down: '#d9584c',
  scarf: '#b8423f', knit: '#b8423f', cap: '#efb243', umbrella: '#3b7fe0', glove: '#6b4532', shoe: '#3a302b',
};
const darken = (hex, k = 0.72) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
const MIRROR = 'matrix(-1 0 0 1 160 0)';
// 塗り＋輪郭＋立体感の陰影
const part = (d, fill) => `<path d="${d}" fill="${fill}" stroke="${darken(fill)}" stroke-width="1" stroke-linejoin="round"/><path d="${d}" fill="url(#tf-shade)"/>`;
const pair = (d, fill) => `${part(d, fill)}<g transform="${MIRROR}">${part(d, fill)}</g>`;
// しわ・縫い目などの線
const lines = (d, color = 'rgba(0,0,0,.18)', w = 1) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pairLines = (d, color, w) => `${lines(d, color, w)}<g transform="${MIRROR}">${lines(d, color, w)}</g>`;
const pairEl = (svg) => `${svg}<g transform="${MIRROR}">${svg}</g>`;
// 髪：単色の上にグラデーションを重ねる（グラデーションが効かなくても髪が消えない）
const hair = (d) => `<path d="${d}" fill="#3a2a1f"/><path d="${d}" fill="url(#tf-hair)"/>`;
const buttons = (xs, ys, color) => xs.flatMap((x) => ys.map((y) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${color}"/>`)).join('');

const FIG_DEFS = `<defs>
<linearGradient id="tf-shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".14"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<radialGradient id="tf-face" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#f8d9bf"/><stop offset=".7" stop-color="${SKIN}"/><stop offset="1" stop-color="${SKIN_SHADE}"/></radialGradient>
<linearGradient id="tf-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e4332"/><stop offset="1" stop-color="#2c1f17"/></linearGradient>
<linearGradient id="tf-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#666"/><stop offset=".5" stop-color="#111"/></linearGradient>
</defs>`;

// viewBox を変えると一部だけ切り抜いて表示できる（週間予報では頭〜腰）
function figureSVG(f, viewBox = '0 -8 170 292') {
  const p = [FIG_DEFS];
  p.push('<ellipse cx="80" cy="281" rx="44" ry="5" fill="rgba(0,0,0,.12)"/>'); // 足もとの影

  // 脚・靴
  p.push(pair('M59 150 Q57 185 62 215 Q60 242 64 268 L74 268 Q75 242 76 215 Q79 185 80 150 Z', SKIN));
  p.push(pair('M61 263 L75 263 Q77 271 76 279 L55 279 Q53 272 61 267 Z', CLOTH.shoe));
  if (f.bottom === 'shorts') {
    p.push(pair('M56 136 L80 136 L80 166 L77 190 L54 188 Q53 160 56 136 Z', CLOTH.shorts));
    p.push(pairLines('M56 143 L80 143', 'rgba(0,0,0,.2)'), pairLines('M55 182 L78 184 M62 160 Q66 166 70 164'));
  } else {
    p.push(pair('M56 136 L80 136 L80 168 L76.5 268 L61 268 Q58 205 55 160 Z', CLOTH.pants));
    p.push(pairLines('M56 143 L80 143', 'rgba(0,0,0,.2)'), pairLines('M67 176 L69 262 M63 210 Q68 214 74 211 M64 238 Q69 241 75 238'));
  }

  // 腕・首（服より奥）
  p.push(pair('M58 72 Q47 98 46 136 Q44 162 43 186 L53 187 Q55 162 58 138 Q61 108 66 84 Z', SKIN));
  p.push(part('M72 48 L88 48 L89 72 Q80 77 71 72 Z', SKIN));
  // 後ろ髪
  p.push(hair('M61 40 Q57 9 80 9 Q103 9 99 40 Q99 50 95 54 L65 54 Q61 50 61 40 Z'));

  // トップス
  const torso = 'M65 64 Q80 76 95 64 Q103 68 108 76 Q108 112 104 150 L56 150 Q52 112 52 76 Q57 68 65 64 Z';
  if (f.top === 'tank') {
    p.push(part('M64 64 Q80 86 96 64 L100 66 Q103 90 105 112 Q106 132 104 150 L56 150 Q54 132 55 112 Q57 90 60 66 Z', CLOTH.tank));
    p.push(lines('M64 64 Q80 86 96 64', darken(CLOTH.tank, 0.8), 2), pairLines('M60 122 Q66 127 72 124 M62 140 Q68 143 74 141'));
  } else if (f.top === 'tee') {
    p.push(pair('M53 74 Q44 88 42 110 L58 114 Q60 98 65 86 Z', CLOTH.tee), part(torso, CLOTH.tee));
    p.push(lines('M65 64 Q80 78 95 64', darken(CLOTH.tee, 0.8), 2.2), pairLines('M44 104 L58 108 M59 92 Q62 100 60 108 M60 124 Q67 129 73 126'));
  } else {
    p.push(pair('M53 74 Q43 100 44 138 Q42 162 41 184 L54 186 Q56 162 58 140 Q61 110 66 86 Z', CLOTH.long), part(torso, CLOTH.long));
    p.push(pairLines('M41.5 177 L54.5 179 M47 120 Q52 124 56 122 M60 124 Q67 129 73 126'));
    p.push(lines('M80 76 L80 150', 'rgba(0,0,0,.15)'), buttons([80], [90, 106, 122, 138], '#c9ced6'));
    p.push(pair('M68 60 L80 76 L65 72 Z', CLOTH.long)); // 襟
  }

  // アウター
  const sleeve = 'M51 70 Q40 100 41 138 Q39 162 38 186 L55 188 Q57 162 59 140 Q62 112 67 86 Z';
  const shirtV = `<path d="M70 62 L80 102 L90 62 Z" fill="${CLOTH.long}"/>${pair('M70 60 L80 76 L74 76 Z', CLOTH.long)}`;
  if (f.outer === 'cardigan') {
    const c = CLOTH.cardigan;
    p.push(pair(sleeve, c), pair('M64 62 L76 70 L77 156 L54 156 Q49 114 50 76 Q55 66 64 62 Z', c));
    p.push(pairLines('M38.5 180 L55 182 M54 149 L77 149', darken(c, 0.8)), pairLines('M58 100 L58 140 M62 98 L63 142', 'rgba(0,0,0,.08)'));
    p.push(buttons([74], [92, 108, 124, 140], darken(c, 0.6)));
  } else if (f.outer === 'jacket') {
    const c = CLOTH.jacket;
    p.push(pair(sleeve, c), part('M62 62 L98 62 Q106 66 110 76 Q111 118 107 160 L53 160 Q49 118 50 76 Q54 66 62 62 Z', c), shirtV);
    p.push(pair('M68 61 L80 104 L72 94 L62 74 Z', darken(c, 0.9)));
    p.push(lines('M80 104 L80 160', 'rgba(0,0,0,.25)'), buttons([80], [116, 134], darken(c, 0.55)));
    p.push(pairLines('M58 140 L71 140 M38.5 180 L55 182 M46 118 Q51 122 56 120', 'rgba(0,0,0,.22)'));
  } else if (f.outer === 'trench' || f.outer === 'coat') {
    const c = CLOTH[f.outer];
    p.push(pair(sleeve, c), part('M62 62 L98 62 Q106 66 110 76 Q113 150 117 236 L43 236 Q47 150 50 76 Q54 66 62 62 Z', c), shirtV);
    p.push(pair('M67 59 L80 100 L70 92 L59 74 Z', darken(c, 0.9)));
    p.push(lines('M84 100 L84 236', 'rgba(0,0,0,.25)'), buttons([73, 89], [110, 126, 160], darken(c, 0.55)));
    p.push(pairLines('M38.5 180 L55 182 M57 196 L54 234 M67 186 L66 234 M46 118 Q51 122 56 120', 'rgba(0,0,0,.2)'));
    if (f.outer === 'trench') {
      p.push(part('M48 134 L112 134 L112 143 L48 143 Z', darken(c, 0.85)));
      p.push(`<rect x="76" y="132" width="10" height="13" rx="1.5" fill="none" stroke="${darken(c, 0.5)}" stroke-width="1.6"/>`);
      p.push(pairEl(`<path d="M52 64 L64 64 L60 82 L51 80 Z" fill="${darken(c, 0.93)}" stroke="${darken(c)}" stroke-width=".8"/>`)); // 肩のフラップ
    }
  } else if (f.outer === 'down') {
    const c = CLOTH.down;
    p.push(pair('M50 68 Q37 100 38 138 Q36 162 35 186 L56 189 Q59 162 61 140 Q64 112 69 86 Z', c));
    p.push(pairLines('M41 108 L63 112 M39 138 L60 141 M37 164 L58 166', darken(c, 0.78), 1.4));
    p.push(part('M56 62 Q80 56 104 62 Q110 66 113 78 Q116 118 111 168 Q80 175 49 168 Q44 118 47 78 Q50 66 56 62 Z', c));
    p.push(lines('M48 90 Q80 97 112 90 M47 112 Q80 119 113 112 M47 134 Q80 141 113 134 M48 154 Q80 161 112 154', darken(c, 0.78), 1.4));
    p.push(part('M63 50 L97 50 L99 70 Q80 77 61 70 Z', c), lines('M80 72 L80 172', darken(c, 0.6), 1.6));
  }

  // 頭・顔
  p.push(pairEl(`<ellipse cx="63.5" cy="38" rx="3.5" ry="5.5" fill="${SKIN}" stroke="${SKIN_SHADE}"/>`));
  // 先に単色で塗っておく（グラデーションが効かない環境でも顔が白く抜けないように）
  p.push(`<ellipse cx="80" cy="36" rx="17" ry="21" fill="${SKIN}"/>`);
  p.push(`<ellipse cx="80" cy="36" rx="17" ry="21" fill="url(#tf-face)" stroke="${SKIN_SHADE}" stroke-width=".8"/>`);
  p.push(pairLines('M69 28.5 Q73 26.5 77 28.5', '#3b2a1f', 1.6));
  p.push(pairEl('<ellipse cx="73" cy="34.5" rx="2.3" ry="1.7" fill="#2a1c14"/><circle cx="73.8" cy="33.9" r=".6" fill="#fff"/>'));
  p.push(lines('M80 36.5 Q82.8 42.5 79 43.5', SKIN_SHADE, 1.2), lines('M75 48.5 Q80 51 85 48.5', '#b5655a', 1.5));
  p.push(pairEl('<circle cx="69.5" cy="42.5" r="3.5" fill="rgba(232,120,110,.22)"/>'));
  // 前髪
  p.push(hair('M62.5 36 Q60 11 80 11 Q100 11 97.5 36 Q96 26 91 21.5 Q84 28 72 24.5 Q66 26 62.5 36 Z'));
  p.push(lines('M70 16 Q76 14 82 17 M86 15 Q91 17 94 22', 'rgba(255,255,255,.18)', 1.2));

  // 小物
  if (f.mask) {
    p.push('<path d="M66 39 Q80 36 94 39 L93 52 Q80 57 67 52 Z" fill="#fff" stroke="#cfd6df"/>');
    p.push(lines('M68 43.5 Q80 41.5 92 43.5 M68 47.5 Q80 46.5 92 47.5', '#dde3ea'), pairLines('M66 40 L62 36 M67 51 L62 42', '#cfd6df'));
  }
  if (f.sun) {
    p.push(pairEl('<rect x="65.5" y="30.5" width="12.5" height="8.5" rx="3.5" fill="url(#tf-glass)"/>'), lines('M78 33 Q80 32 82 33', '#111', 1.4));
    p.push(part('M62 25 Q62 7 80 7 Q98 7 98 25 Z', CLOTH.cap), part('M92 23 Q108 21 115 27 L94 27 Z', darken(CLOTH.cap, 0.9)));
    p.push(lines('M80 7 L80 25 M70 9 Q68 16 68 25', darken(CLOTH.cap, 0.8)), `<circle cx="80" cy="7" r="2" fill="${darken(CLOTH.cap, 0.85)}"/>`);
  }
  if (f.hat === 'knit') {
    const c = CLOTH.knit;
    p.push(part('M61 27 Q61 3 80 3 Q99 3 99 27 Z', c), lines('M70 6 Q67 14 67 23 M80 3 L80 23 M90 6 Q93 14 93 23', darken(c, 0.82)));
    p.push(part('M59 21 L101 21 L101 31 Q80 33 59 31 Z', darken(c, 0.88)));
    p.push(lines(Array.from({ length: 10 }, (_, i) => `M${62 + i * 4} 22 L${62 + i * 4} 31`).join(' '), darken(c, 0.7)));
    p.push('<circle cx="80" cy="1" r="6" fill="#f3eee6" stroke="#d8d0c4"/>');
  }
  if (f.scarf) {
    const c = CLOTH.scarf;
    p.push(part('M64 57 Q80 67 96 57 L98 72 Q80 82 62 72 Z', c), part('M84 72 L87 120 L98 118 L94 70 Z', darken(c, 0.9)));
    p.push(lines('M85 84 L95 83 M86 96 L96 95 M63 64 Q80 73 97 64', darken(c, 0.7), 1.4));
    p.push(lines(Array.from({ length: 5 }, (_, i) => `M${88 + i * 2.2} 119.5 L${88 + i * 2.2} 125`).join(' '), darken(c, 0.85), 1.2));
  }
  if (f.umbrella) {
    const c = CLOTH.umbrella;
    p.push(lines('M113 196 L125 15', '#4a4a4a', 2.2), lines('M113 196 Q112 205 105 204', '#4a4a4a', 2.4));
    p.push(part('M86 40 Q124 -10 164 40 Q154 33 144.5 40 Q135 33 125 40 Q115 33 105.5 40 Q96 33 86 40 Z', c));
    p.push(lines('M125 15 L105.5 40 M125 15 L125 40 M125 15 L144.5 40 M125 15 L125 8', darken(c, 0.75), 1.1));
  }
  // 手（手袋）
  p.push(pair('M42 184 Q40 196 44 204 Q49 208 53 202 Q55 194 54 185 Z', f.gloves ? CLOTH.glove : SKIN));

  // グラデーションの id が複数の絵で重複すると、非表示の絵の定義を参照して顔や髪が塗られなくなるため、絵ごとに id を変える
  const uid = `tf${++figureSVG.count}-`;
  return `<svg viewBox="${viewBox}" role="img" aria-label="${f.label}">${p.join('').replace(/tf-(shade|face|hair|glass)\b/g, `${uid}$1`)}</svg>`;
}
figureSVG.count = 0;

// ---------- API ----------
// range: 既定は昨日〜7日先。旅行では { start_date, end_date } を渡す（16日先まで）
async function fetchForecast(lat, lon, range = { forecast_days: 7, past_days: 1 }) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', wind_speed_unit: 'ms', ...range,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,relative_humidity_2m,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`天気データの取得に失敗しました（${res.status}）`);
  return res.json();
}

// PM2.5・黄砂（Open-Meteo Air Quality、APIキー不要）
async function fetchAir(lat, lon) {
  const params = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 3, hourly: 'pm2_5,dust' });
  const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
  if (!res.ok) throw new Error(res.status);
  return (await res.json()).hourly;
}

// 花粉（ウェザーニューズの観測データ、APIキー不要）。2〜5月のみ、県庁所在地の観測値
const prefOf = (place) => Object.keys(POLLEN_CITY).find((p) => (place.admin || '').includes(p) || place.name === p);
async function fetchPollen(place) {
  const pref = prefOf(place);
  if (!pref) return null; // 日本以外
  const now = new Date();
  const m = now.getMonth() + 1;
  if (m < 2 || m > 5) return { status: 'off', pref };
  const ymd = `${now.getFullYear()}${String(m).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const res = await fetch(`https://wxtech.weathernews.com/opendata/v1/pollen?citycode=${POLLEN_CITY[pref]}&start=${ymd}&end=${ymd}`);
  if (!res.ok) return { status: 'none', pref };
  const vals = (await res.text()).trim().split('\n').slice(1)
    .map((line) => Number(line.split(',')[2]))
    .filter((v) => Number.isFinite(v) && v >= 0); // -9999 は欠測
  if (!vals.length) return { status: 'none', pref };
  return { status: 'ok', pref, max: Math.max(...vals) };
}

// 座標 → 地名（BigDataCloud、APIキー不要）。失敗したら「現在地」のまま
async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'ja' });
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`);
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    const name = d.city || d.locality;
    if (name) return { name, admin: d.principalSubdivision && d.principalSubdivision !== name ? d.principalSubdivision : '' };
  } catch { /* 地名が取れなくても天気は表示する */ }
  return { name: '現在地', admin: '' };
}

async function geocode(name) {
  const params = new URLSearchParams({ name, count: 10, language: 'ja', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`地域の検索に失敗しました（${res.status}）`);
  return (await res.json()).results || [];
}

async function searchPlaces(query) {
  // 日本語の地名は「横浜」より「横浜市」の方が見つかりやすいので両方で検索する
  const names = [query];
  if (!/[市区町村都道府県]$/.test(query)) names.push(`${query}市`);
  const all = (await Promise.all(names.map(geocode))).flat();
  // 重複を除き、人口の多い順（主要都市を先頭）に並べる
  const seen = new Set();
  const results = all
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .sort((a, b) => (b.population || 0) - (a.population || 0))
    .slice(0, 10);
  return results.map((r) => ({
    name: r.name, admin: [r.admin1, r.country].filter(Boolean).join('・'),
    lat: r.latitude, lon: r.longitude,
  }));
}

// ---------- 描画 ----------
const $ = (id) => document.getElementById(id);
const fmt = (n) => `${Math.round(n)}℃`;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
// 日付（YYYY-MM-DD の文字列）
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const daysBetween = (from, to) => {
  const list = [];
  for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
  return list;
};
const dateLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', isError);
}

function todayIndex(data) {
  return Math.max(0, data.daily.time.indexOf(data.current.time.slice(0, 10)));
}

function render() {
  if (!state) return;
  const { place, data } = state;
  const { current, hourly, daily } = data;
  const ti = todayIndex(data);

  // 現在の天気
  $('place-name').textContent = place.admin ? `${place.name}（${place.admin}）` : place.name;
  $('updated').textContent = `${current.time.replace('T', ' ')} 時点`;
  renderFavButton();
  const [desc, icon] = weatherOf(current.weather_code);
  $('cur-icon').textContent = icon;
  $('cur-temp').textContent = `${current.temperature_2m.toFixed(1)}℃`;
  $('cur-desc').textContent = desc;
  $('cur-feel').textContent = `${current.apparent_temperature.toFixed(1)}℃`;
  $('cur-hum').textContent = `${current.relative_humidity_2m}%`;
  $('cur-wind').textContent = `${current.wind_speed_10m.toFixed(1)}m/s`;
  const today = dayData(data, ti);
  $('today-range').textContent = `${fmt(today.dayMax)} / ${fmt(today.dayMin)}`;

  renderOutfit(ti);

  // 時間ごと（現在時刻から24時間、3時間おき）
  const nowIdx = Math.max(0, hourly.time.findIndex((t) => t >= current.time.slice(0, 13)));
  const hours = [];
  for (let i = nowIdx; i < Math.min(nowIdx + 24, hourly.time.length); i += 3) {
    const h = Number(hourly.time[i].slice(11, 13));
    const box = el('div', `hour${h >= settings.start && h <= settings.end ? '' : ' out'}`);
    box.append(
      el('div', 't', `${h}時`),
      el('div', 'i', weatherOf(hourly.weather_code[i])[1]),
      el('div', 'temp', fmt(hourly.temperature_2m[i])),
      el('div', 'pop', `☂ ${hourly.precipitation_probability[i] ?? '-'}%`),
    );
    hours.push(box);
  }
  $('hourly').replaceChildren(...hours);

  // 週間（今日から）
  const days = [];
  for (let i = ti; i < daily.time.length; i++) {
    const d = dayData(data, i);
    const date = new Date(`${d.date}T00:00:00`);
    const wd = date.getDay();
    const label = i === ti ? '今日' : i === ti + 1 ? '明日' : `${date.getMonth() + 1}/${date.getDate()}`;
    const [dDesc, dIcon] = weatherOf(d.code);
    const row = el('div', 'day');
    const temps = el('div', 'temps');
    temps.append(el('span', 'max', fmt(d.dayMax)), ' / ', el('span', 'min', fmt(d.dayMin)));
    const icn = el('div', 'i', dIcon);
    icn.title = dDesc;
    const wear = el('div', 'wear');
    const outfit = el('span', 'wear-outfit');
    const mini = el('span', 'mini-fig');
    mini.innerHTML = figureSVG({ ...d.outfit.fig, label: d.outfit.title }, '36 -6 88 160');
    outfit.append(mini, `${d.outfit.title}${d.pop >= 50 ? '＋傘' : ''}`);
    wear.append(outfit, el('span', 'lau', d.laundry ? `洗濯${d.laundry.mark}` : ''));
    row.append(
      el('div', `date ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}`, `${label}（${WD[wd]}）`),
      icn, temps, el('div', 'pop', `☂ ${d.pop}%`), wear,
    );
    days.push(row);
  }
  $('daily').replaceChildren(...days);

  renderPager();
  $('result').hidden = false;
}

// 服装カード（今日／明日）
function renderOutfit(ti) {
  const { data } = state;
  const di = Math.min(ti + viewDay, data.daily.time.length - 1);
  const day = dayData(data, di);
  const prev = di > 0 ? dayData(data, di - 1) : null;
  const air = dayAir(state.air, day.date);
  const pollen = viewDay === 0 ? state.pollen : null; // 花粉は今日の観測のみ
  const mask = maskReasons(air, pollen);

  $('outfit-heading').textContent = viewDay ? '明日の服装' : '今日の服装';
  document.querySelectorAll('.day-tabs button').forEach((b) => {
    const on = Number(b.dataset.day) === viewDay;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $('window-label').textContent = `（${settings.start}〜${settings.end}時）`;
  $('compare').textContent = compareText(day, prev, viewDay ? '今日' : '昨日');
  $('compare').hidden = !prev;

  const fig = { ...day.outfit.fig, label: day.outfit.title };
  fig.umbrella = day.pop >= 50;
  fig.gloves = fig.gloves || day.feelMin <= 3;
  fig.sun = day.uv >= 8 && !fig.umbrella && !fig.hat;
  fig.mask = mask.length > 0;
  $('figure').innerHTML = figureSVG(fig);

  $('outfit-title').textContent = day.outfit.title;
  const pref = settings.offset > 0 ? '（暑がり設定）' : settings.offset < 0 ? '（寒がり設定）' : '';
  $('outfit-detail').textContent = `体感 最高 ${fmt(day.feelMax)}・最低 ${fmt(day.feelMin)}${pref}。${day.outfit.detail}`;
  const pos = Math.min(100, Math.max(0, ((day.feelMax + settings.offset + 5) / 40) * 100)); // -5℃〜35℃
  $('index-marker').style.left = `${pos}%`;

  const tips = buildAdvice(day);
  if (mask.length) tips.push(`😷 ${mask.join('・')}が多め。マスクがあると安心です。`);
  $('advice').replaceChildren(...tips.map((t) => el('li', null, t)));

  renderAir(air, pollen);

  const lau = day.laundry;
  $('laundry').replaceChildren();
  if (lau) {
    $('laundry').append(el('span', 'laundry-mark', lau.mark), el('strong', null, `洗濯：${lau.label}`), el('span', null, lau.text));
  }

  renderItems(day, buildItems(day, mask));
}

function renderAir(air, pollen) {
  const parts = [];
  if (air?.pm25 != null) {
    const [label, warn] = pmLevel(air.pm25);
    parts.push(['PM2.5', `${label}（${Math.round(air.pm25)}µg/m³）`, warn]);
  }
  if (air?.dust != null) {
    const [label, warn] = dustLevel(air.dust);
    parts.push(['黄砂', label, warn]);
  }
  if (pollen) {
    if (pollen.status === 'ok') {
      const [label, warn] = pollenLevel(pollen.max);
      parts.push(['花粉', `${label}（${pollen.pref}の観測）`, warn]);
    } else {
      parts.push(['花粉', pollen.status === 'off' ? '観測期間外（2〜5月に表示）' : 'データなし', 0]);
    }
  }
  $('air').replaceChildren(...parts.map(([k, v, warn]) => {
    const s = el('span', `air-item${warn ? ' warn' : ''}`);
    s.append(el('strong', null, k), ` ${v}`);
    return s;
  }));
}

// 持ち物チェックリスト（今日・明日は日付ごと、旅行は旅行ごとにチェックを保存）
function renderItems(day, items) {
  renderChecklist($('items'), $('items-count'), items, day.date);
}

function renderChecklist(ul, countEl, items, key) {
  const ids = new Set(items.map((it) => it.id));
  const done = new Set((store.get('checks', {})[key] || []).filter((id) => ids.has(id)));
  const count = () => {
    const n = items.filter((it) => done.has(it.id)).length;
    countEl.textContent = items.length ? `${n} / ${items.length}` : '';
  };
  const save = () => {
    // 同じ key を使う別のリスト（旅行の服・持ち物）のチェックは残す
    const checks = store.get('checks', {});
    const others = (checks[key] || []).filter((id) => !ids.has(id));
    const keep = {};
    const today = toISO(new Date());
    // 過ぎた日付のチェックは消す（旅行のチェックは旅行を消すまで残す）
    Object.keys(checks).forEach((k) => { if (!/^\d{4}-/.test(k) || k >= today) keep[k] = checks[k]; });
    keep[key] = [...others, ...done];
    store.set('checks', keep);
  };

  if (items.length === 0) {
    ul.replaceChildren(el('li', 'none', '特別な持ち物はありません。'));
    count();
    return;
  }
  ul.replaceChildren(...items.map((it) => {
    const li = el('li', done.has(it.id) ? 'done' : '');
    const label = el('label');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = done.has(it.id);
    box.addEventListener('change', () => {
      if (box.checked) done.add(it.id); else done.delete(it.id);
      li.classList.toggle('done', box.checked);
      save();
      count();
    });
    label.append(box, el('span', 'icon', it.icon), el('span', 'name', it.name), el('span', 'why', it.why));
    li.append(label);
    return li;
  }));
  count();
}

document.querySelectorAll('.day-tabs button').forEach((b) => b.addEventListener('click', () => {
  viewDay = Number(b.dataset.day);
  if (state) renderOutfit(todayIndex(state.data));
}));

// ---------- お気に入り ----------
function renderFavButton() {
  const on = state && isFavorite(state.place);
  $('fav-btn').textContent = on ? '★ お気に入り' : '☆ お気に入りに追加';
  $('fav-btn').classList.toggle('on', on);
}

function renderFavorites() {
  const box = $('favorites');
  box.hidden = favorites.length === 0;
  box.replaceChildren(el('span', 'chips-label', '★'), ...favorites.map((p) => {
    const chip = el('span', 'chip');
    const go = el('button', 'chip-main', p.name);
    go.type = 'button';
    go.addEventListener('click', () => loadPlace(p));
    const del = el('button', 'chip-del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', `${p.name} をお気に入りから外す`);
    del.addEventListener('click', () => toggleFavorite(p));
    chip.append(go, del);
    return chip;
  }));
}

function toggleFavorite(place) {
  favorites = isFavorite(place)
    ? favorites.filter((f) => placeKey(f) !== placeKey(place))
    : [...favorites, place];
  store.set('favorites', favorites);
  renderFavorites();
  renderFavButton();
  renderPager();
}

$('fav-btn').addEventListener('click', () => state && toggleFavorite(state.place));

// ---------- お気に入りの切り替え（スワイプ・横スクロール） ----------
const favIndex = () => (state ? favorites.findIndex((f) => placeKey(f) === placeKey(state.place)) : -1);

// step: +1 で次、-1 で前（端まで行ったら反対側に戻る）
function stepFavorite(step) {
  const n = favorites.length;
  const i = favIndex();
  if (n === 0 || (n === 1 && i === 0)) return;
  const next = i === -1 ? (step > 0 ? 0 : n - 1) : (i + step + n) % n;
  loadPlace(favorites[next], step > 0 ? 'next' : 'prev');
}

function renderPager() {
  const n = favorites.length;
  const i = favIndex();
  const show = n >= 2 || (n === 1 && i === -1);
  $('pager').hidden = !show;
  if (!show) return;
  $('pager-dots').replaceChildren(...favorites.map((p, k) => {
    const dot = el('button', `dot${k === i ? ' on' : ''}`);
    dot.type = 'button';
    dot.title = p.name;
    dot.setAttribute('aria-label', p.name);
    dot.addEventListener('click', () => { if (k !== i) loadPlace(p, k > i ? 'next' : 'prev'); });
    return dot;
  }));
}

$('pager-prev').addEventListener('click', () => stepFavorite(-1));
$('pager-next').addEventListener('click', () => stepFavorite(1));

// スマホ：左右にスワイプ（時間ごとの天気・設定の操作中は除く）
let touch = null;
$('result').addEventListener('touchstart', (e) => {
  touch = e.touches.length === 1 && !e.target.closest('.hourly, input, select, .day-tabs')
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { passive: true });
$('result').addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepFavorite(dx < 0 ? 1 : -1);
}, { passive: true });

// パソコン：トラックパッドの横スクロール・Shift+ホイール
let wheelX = 0;
let wheelLock = 0;
let wheelReset = null;
$('result').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || e.target.closest('.hourly')) return;
  if (Date.now() < wheelLock) return;
  wheelX += e.deltaX;
  clearTimeout(wheelReset);
  wheelReset = setTimeout(() => { wheelX = 0; }, 200);
  if (Math.abs(wheelX) > 120) {
    stepFavorite(wheelX > 0 ? 1 : -1);
    wheelX = 0;
    wheelLock = Date.now() + 800; // 1回のスクロールで何地域も進まないように
  }
}, { passive: true });

// ---------- 前日のお知らせ ----------
let notifyTimer = null;
const canNotify = () => 'Notification' in window && Notification.permission === 'granted';

async function showNotice(title, body) {
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'tenki-fuku-tomorrow' };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (reg) await reg.showNotification(title, opts);
  else new Notification(title, opts);
}

async function sendTomorrowNotice() {
  const place = state?.place || store.get('last', null);
  if (!place) return;
  const data = await fetchForecast(place.lat, place.lon);
  const ti = todayIndex(data);
  const today = dayData(data, ti);
  const tomorrow = dayData(data, ti + 1);
  const extra = tomorrow.pop >= 50 ? '傘を忘れずに。' : tomorrow.pop >= 30 ? '折りたたみ傘があると安心。' : '';
  await showNotice(
    `明日の服装：${tomorrow.outfit.title}（${place.name}）`,
    `${weatherOf(tomorrow.code)[0]}・体感 最高 ${fmt(tomorrow.feelMax)}。${compareText(tomorrow, today, '今日')}${extra}`,
  );
}

function scheduleNotify() {
  clearTimeout(notifyTimer);
  if (!settings.notify || !canNotify()) return;
  const now = new Date();
  const at = new Date(now);
  at.setHours(settings.notifyH, 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  notifyTimer = setTimeout(async () => {
    try { await sendTomorrowNotice(); } catch { /* 通信できないときは送らない */ }
    scheduleNotify();
  }, at - now);
}

function renderNotifyDesc(msg) {
  $('notify-desc').textContent = msg || (settings.notify
    ? `毎日 ${settings.notifyH}時に、最後に見た地域の明日の服装をお知らせします。このページ（アプリ）を閉じていると届きません。`
    : '18時以降に開くと、自動で「明日」の服装を表示します。');
}

// ---------- 設定 ----------
function renderOffsetDesc() {
  const o = settings.offset;
  $('offset-desc').textContent = o === 0
    ? '標準の基準で服装を選びます。'
    : `体感を ${o > 0 ? '+' : ''}${o}℃ として服装を選びます（${o > 0 ? '薄着寄り' : '厚着寄り'}）。`;
}

function initSettings() {
  $('offset').value = settings.offset;
  renderOffsetDesc();
  for (let h = 0; h <= 23; h++) {
    $('start-h').append(new Option(`${h}時`, h));
    $('end-h').append(new Option(`${h}時`, h));
  }
  $('start-h').value = settings.start;
  $('end-h').value = settings.end;

  $('offset').addEventListener('input', () => {
    settings.offset = Number($('offset').value);
    renderOffsetDesc();
    store.set('settings', settings);
    render();
  });
  const onTime = (changed) => {
    let s = Number($('start-h').value);
    let e = Number($('end-h').value);
    if (e <= s) { // 帰る時刻は出かける時刻より後にする
      if (changed === 'start') e = Math.min(23, s + 1); else s = Math.max(0, e - 1);
      $('start-h').value = s;
      $('end-h').value = e;
    }
    settings.start = s;
    settings.end = e;
    store.set('settings', settings);
    render();
  };
  $('start-h').addEventListener('change', () => onTime('start'));
  $('end-h').addEventListener('change', () => onTime('end'));

  // お知らせ
  for (let h = 15; h <= 23; h++) $('notify-h').append(new Option(`${h}時`, h));
  $('notify-h').value = settings.notifyH;
  $('notify-on').checked = settings.notify && canNotify();
  renderNotifyDesc();

  const askPermission = async () => {
    if (!('Notification' in window)) {
      renderNotifyDesc('このブラウザは通知に対応していません（iPhone はホーム画面に追加すると使えます）。');
      return false;
    }
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') {
      renderNotifyDesc('通知が許可されませんでした。ブラウザの設定でこのサイトの通知を許可してください。');
      return false;
    }
    return true;
  };
  $('notify-on').addEventListener('change', async () => {
    if ($('notify-on').checked && !(await askPermission())) $('notify-on').checked = false;
    settings.notify = $('notify-on').checked;
    store.set('settings', settings);
    scheduleNotify();
    if (canNotify() || !settings.notify) renderNotifyDesc();
  });
  $('notify-h').addEventListener('change', () => {
    settings.notifyH = Number($('notify-h').value);
    store.set('settings', settings);
    scheduleNotify();
    renderNotifyDesc();
  });
  $('notify-test').addEventListener('click', async () => {
    if (!(await askPermission())) return;
    try { await sendTomorrowNotice(); } catch { renderNotifyDesc('通知の送信に失敗しました。通信状態を確認してください。'); }
  });
}

// ---------- 読み込み ----------
// dir: 'next' / 'prev' のとき、切り替えのアニメーションを付ける
async function loadPlace(place, dir) {
  setStatus(`${place.name} の天気を取得中…`);
  document.querySelectorAll('.presets button').forEach((b) => b.classList.toggle('active', b.textContent === place.name));
  try {
    // 空気・花粉は取れなくても天気は表示する
    const [data, air, pollen] = await Promise.all([
      fetchForecast(place.lat, place.lon),
      fetchAir(place.lat, place.lon).catch(() => null),
      fetchPollen(place).catch(() => null),
    ]);
    viewDay = Number(data.current.time.slice(11, 13)) >= 18 ? 1 : 0; // 夜は明日の服装を表示
    state = { place, data, air, pollen };
    render();
    if (dir) {
      const r = $('result');
      r.classList.remove('slide-next', 'slide-prev');
      void r.offsetWidth; // アニメーションをやり直すため
      r.classList.add(`slide-${dir}`);
    }
    setStatus('');
    store.set('last', place);
  } catch (e) {
    setStatus(e.message || '通信エラーが発生しました', true);
  }
}

// ---------- 検索 ----------
function showResults(list) {
  const ul = $('search-results');
  if (list.length === 0) {
    ul.hidden = true;
    setStatus('該当する地域が見つかりませんでした。「区」「町」を外して検索してみてください', true);
    return;
  }
  ul.replaceChildren(...list.map((p) => {
    const li = el('li', null, p.name);
    li.append(el('small', null, p.admin));
    li.addEventListener('click', () => { ul.hidden = true; $('search-input').value = ''; loadPlace(p); });
    return li;
  }));
  ul.hidden = false;
  setStatus('');
}

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('search-input').value.trim();
  if (!q) return;
  setStatus('検索中…');
  try {
    const list = await searchPlaces(q);
    if (list.length === 1) { $('search-input').value = ''; loadPlace(list[0]); }
    else showResults(list);
  } catch (err) {
    setStatus(err.message, true);
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) $('search-results').hidden = true;
});

$('geo-btn').addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('このブラウザは位置情報に対応していません', true); return; }
  setStatus('現在地を取得中…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      loadPlace({ ...(await reverseGeocode(lat, lon)), lat, lon });
    },
    () => setStatus('現在地を取得できませんでした。位置情報の許可を確認してください', true),
    { timeout: 10000 },
  );
});

$('presets').replaceChildren(...PRESETS.map((p) => {
  const b = el('button', null, p.name);
  b.type = 'button';
  b.addEventListener('click', () => loadPlace(p));
  return b;
}));

// ---------- 旅行 ----------
const FORECAST_DAYS = 16; // 予報が出ている日数（今日を含む）
const CLIMATE_YEARS = 3;  // 16日より先は過去3年の同じ日の天気から目安を出す
const MAX_TRIP_DAYS = 31;

// 過去の年の同じ日（2/29 は 2/28 にする）
const sameDayYearsAgo = (iso, k) => {
  const s = `${Number(iso.slice(0, 4)) - k}${iso.slice(4)}`;
  return s.endsWith('-02-29') ? s.replace('-02-29', '-02-28') : s;
};

async function climateDays(place, from, to) {
  const daily = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,wind_speed_10m_max';
  const years = await Promise.all(Array.from({ length: CLIMATE_YEARS }, async (_, j) => {
    const params = new URLSearchParams({
      latitude: place.lat, longitude: place.lon, timezone: 'auto', wind_speed_unit: 'ms', daily,
      start_date: sameDayYearsAgo(from, j + 1), end_date: sameDayYearsAgo(to, j + 1),
    });
    const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if (!res.ok) throw new Error(`過去の天気の取得に失敗しました（${res.status}）`);
    return (await res.json()).daily;
  }));

  return daysBetween(from, to).map((date) => {
    const rows = years.map((d, j) => {
      const i = d.time.indexOf(sameDayYearsAgo(date, j + 1));
      if (i < 0 || d.temperature_2m_max[i] == null) return null;
      return {
        tMax: d.temperature_2m_max[i], tMin: d.temperature_2m_min[i],
        fMax: d.apparent_temperature_max[i], fMin: d.apparent_temperature_min[i],
        rain: d.precipitation_sum[i] ?? 0, wind: d.wind_speed_10m_max[i] ?? 0, code: d.weather_code[i],
      };
    }).filter(Boolean);
    if (!rows.length) return null;
    const mean = (k) => avg(rows.map((r) => r[k]));
    const tMax = mean('tMax');
    const feelMax = mean('fMax');
    const pop = Math.round((100 * rows.filter((r) => r.rain >= 1).length) / rows.length); // 雨（1mm以上）だった年の割合
    const snow = rows.some((r) => isSnow(r.code)) && tMax < 5;
    return {
      date, source: 'climate',
      code: pop >= 50 ? (snow ? 73 : 63) : pop > 0 ? (snow ? 71 : 2) : 1,
      dayMax: tMax, dayMin: mean('tMin'), tMax, tMin: mean('tMin'),
      feelMax, feelMin: mean('fMin'), pop, wind: mean('wind'), uv: 0, humAvg: 0, codes: [], snow,
      outfit: outfitFor(feelMax + settings.offset), laundry: null,
    };
  }).filter(Boolean);
}

// ある場所の from〜to の各日（16日先までは予報、それより先は平年の目安）
async function fetchTripDays(place, from, to) {
  const lastForecast = addDays(toISO(new Date()), FORECAST_DAYS - 1);
  const jobs = [];
  if (from <= lastForecast) {
    jobs.push(fetchForecast(place.lat, place.lon, { start_date: from, end_date: to < lastForecast ? to : lastForecast })
      .then((data) => data.daily.time.map((_, i) => ({ ...dayData(data, i), source: 'forecast' }))));
  }
  if (to > lastForecast) jobs.push(climateDays(place, from > lastForecast ? from : addDays(lastForecast, 1), to));
  return (await Promise.all(jobs)).flat().map((d) => ({ ...d, place }));
}

// 旅行全体のまとめ
function tripSummary(days, homeDays, home) {
  const tips = [];
  const maxs = days.map((d) => d.dayMax);
  const mins = days.map((d) => d.dayMin);
  tips.push(`🌡️ 期間中の気温は 最高 ${fmt(Math.min(...maxs))}〜${fmt(Math.max(...maxs))}、最低 ${fmt(Math.min(...mins))}〜${fmt(Math.max(...mins))}。`);

  const counts = new Map();
  days.forEach((d) => counts.set(d.outfit, (counts.get(d.outfit) || 0) + 1));
  const main = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const coldest = days.reduce((a, b) => (OUTFITS.indexOf(b.outfit) > OUTFITS.indexOf(a.outfit) ? b : a));
  const warmest = days.reduce((a, b) => (OUTFITS.indexOf(b.outfit) < OUTFITS.indexOf(a.outfit) ? b : a));
  let wear = `👕 服装は「${main.title}」が中心。`;
  if (coldest.outfit !== main) wear += `いちばん寒い ${dateLabel(coldest.date)} は「${coldest.outfit.title}」が必要です。`;
  if (warmest.outfit !== main && OUTFITS.indexOf(warmest.outfit) < OUTFITS.indexOf(main) - 1) wear += `暖かい ${dateLabel(warmest.date)} は「${warmest.outfit.title}」で過ごせます。`;
  tips.push(wear);

  const rainy = days.filter((d) => d.pop >= 50);
  const maybe = days.filter((d) => d.pop >= 30 && d.pop < 50);
  if (rainy.length) tips.push(`☔ 雨の可能性が高い日：${[...new Set(rainy.map((d) => dateLabel(d.date)))].join('、')}。折りたたみ傘を持っていきましょう。`);
  else if (maybe.length) tips.push(`🌂 にわか雨の可能性がある日：${[...new Set(maybe.map((d) => dateLabel(d.date)))].join('、')}。折りたたみ傘があると安心。`);
  else tips.push('☀️ 雨の心配は少なそうです。');
  if (days.some((d) => d.snow)) tips.push('⛄ 雪の可能性があります。滑りにくい靴を選びましょう。');
  if (Math.max(...maxs) - Math.min(...mins) >= 12) tips.push('🧥 朝晩と日中の気温差が大きい旅行です。脱ぎ着しやすい重ね着がおすすめ。');

  if (homeDays?.length) {
    const homeBy = new Map(homeDays.map((d) => [d.date, d.dayMax]));
    const diffs = days.filter((d) => homeBy.has(d.date)).map((d) => d.dayMax - homeBy.get(d.date));
    if (diffs.length) {
      const diff = Math.round(avg(diffs));
      const advice = diff <= -3 ? '家で着ている服より厚めに。' : diff >= 3 ? '家で着ている服より薄めでOK。' : '家と同じくらいの服装で大丈夫です。';
      tips.push(diff === 0
        ? `🏠 出発地（${home.name}）とほぼ同じ気温。${advice}`
        : `🏠 出発地（${home.name}）より最高気温が平均 ${Math.abs(diff)}℃ ${diff < 0 ? '低い' : '高い'}。${advice}`);
    }
  }
  if (days.some((d) => d.source === 'climate')) {
    tips.push('📅 16日より先の日は予報がまだ出ていないため、過去3年の同じ日の天気から出した目安です。近くなったらもう一度まとめ直してください。');
  }
  return tips;
}

// 荷物リスト：服（枚数）
function packClothes(days) {
  // 同じ日に2か所いる日は、寒いほうに合わせる
  const byDate = new Map();
  days.forEach((d) => byDate.set(d.date, Math.max(byDate.get(d.date) ?? -1, OUTFITS.indexOf(d.outfit))));
  const levels = [...byDate.values()];
  const n = levels.length;
  const cnt = (f) => levels.filter(f).length;
  const list = [];
  const add = (id, icon, name, num, why) => { if (num > 0) list.push({ id, icon, name: `${name} ×${num}`, why }); };

  add('c-tank', '🎽', 'ノースリーブ・半袖', cnt((l) => l === 0), '真夏日の日');
  add('c-tee', '👕', '半袖Tシャツ', cnt((l) => l === 1), '半袖の日');
  add('c-long', '👔', '長袖シャツ・カットソー', cnt((l) => l >= 2), '長袖の日');
  add('c-knit', '🧶', 'ニット・セーター', Math.min(2, Math.ceil(cnt((l) => l >= 4) / 3)), '寒い日の重ね着');
  add('c-heat', '🔥', 'あったかインナー', cnt((l) => l >= 6), 'とても寒い日');

  const OUTER = { 3: 'カーディガン・薄手の羽織', 4: 'ジャケット', 5: 'トレンチコート・薄手のコート', 6: '冬物コート', 7: 'ダウンジャケット' };
  const outers = levels.filter((l) => l >= 3);
  if (outers.length) {
    const warm = Math.max(...outers);
    add(`c-outer${warm}`, '🧥', OUTER[warm], 1, outers.length > 1 ? 'いちばん寒い日に合わせて' : '');
    const light = Math.min(...levels);
    if (light >= 3 && light <= warm - 2) add(`c-outer${light}`, '🧥', OUTER[light], 1, '暖かい日用');
    else if (light < 3 && warm >= 5) add('c-outer3', '🧥', OUTER[3], 1, '暖かい日・室内用');
  }

  add('c-shorts', '🩳', 'ショートパンツ', Math.ceil(cnt((l) => l === 0) / 2), '真夏日の日');
  add('c-pants', '👖', 'ズボン・スカート', Math.ceil(cnt((l) => l >= 1) / 2), '2日に1枚の目安');
  add('c-under', '🧦', '下着・靴下', n, `${n}日分`);
  return list;
}

// 荷物リスト：持ち物（各日の持ち物をまとめる）
function packItems(days) {
  const map = new Map();
  days.forEach((d) => buildItems(d, []).forEach((it) => {
    const id = it.id === 'folding' ? 'umbrella' : it.id; // 旅行では傘はまとめて折りたたみ傘に
    const item = map.get(id) || { ...it, id, name: id === 'umbrella' ? '折りたたみ傘' : it.name, icon: id === 'umbrella' ? '🌂' : it.icon, dates: new Set() };
    item.dates.add(d.date);
    map.set(id, item);
  }));
  return [...map.values()].map((it) => ({
    ...it,
    name: it.id === 'kairo' ? `${it.name} ×${it.dates.size}` : it.name,
    why: `必要な日：${it.dates.size}日`,
  }));
}

// ----- 旅行の入力フォーム -----
let trip = null;
let trips = store.get('trips', []);

const tripHomeChoices = () => {
  const list = [store.get('last', null), ...favorites].filter(Boolean);
  const seen = new Set();
  return list.filter((p) => !seen.has(placeKey(p)) && seen.add(placeKey(p)));
};

function newTrip() {
  const tomorrow = addDays(toISO(new Date()), 1);
  return { id: null, name: '', home: store.get('last', null), legs: [{ place: null, q: '', from: tomorrow, to: addDays(tomorrow, 2) }] };
}

const tripStatus = (msg, isError = false) => {
  $('trip-status').textContent = msg;
  $('trip-status').classList.toggle('error', isError);
};

function renderTripForm() {
  $('trip-name').value = trip.name;
  renderLegs();

  const homes = tripHomeChoices();
  const sel = $('trip-home');
  sel.replaceChildren(new Option('比べない', ''), ...homes.map((p) => new Option(p.name, placeKey(p))));
  sel.value = trip.home ? placeKey(trip.home) : '';
  if (trip.home && sel.value === '') { // 一覧にない出発地（保存した旅行）
    sel.append(new Option(trip.home.name, placeKey(trip.home)));
    sel.value = placeKey(trip.home);
  }
  renderSavedTrips();
}

function renderLegs() {
  const today = toISO(new Date());
  $('legs').replaceChildren(...trip.legs.map((leg, i) => {
    const row = el('div', 'leg');
    const num = el('span', 'leg-num', `${i + 1}`);

    const wrap = el('div', 'leg-place');
    const input = el('input');
    input.type = 'search';
    input.placeholder = '行き先（例：札幌、那覇）';
    input.enterKeyHint = 'search';
    input.value = leg.place ? leg.place.name : leg.q;
    input.setAttribute('aria-label', `${i + 1}つ目の行き先`);
    const results = el('ul', 'search-results');
    results.hidden = true;
    const find = el('button', 'leg-find', '検索');
    find.type = 'button';

    const choose = (p) => {
      leg.place = p;
      leg.q = p.name;
      input.value = p.name;
      results.hidden = true;
      tripStatus('');
    };
    const search = async () => {
      const q = input.value.trim();
      if (!q) return;
      tripStatus('検索中…');
      try {
        const list = await searchPlaces(q);
        if (list.length === 0) { tripStatus(`「${q}」が見つかりませんでした`, true); return; }
        if (list.length === 1) { choose(list[0]); return; }
        results.replaceChildren(...list.map((p) => {
          const li = el('li', null, p.name);
          li.append(el('small', null, p.admin));
          li.addEventListener('click', () => choose(p));
          return li;
        }));
        results.hidden = false;
        tripStatus('');
      } catch (err) { tripStatus(err.message, true); }
    };
    input.addEventListener('input', () => { leg.q = input.value; leg.place = null; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    find.addEventListener('click', search);
    wrap.append(input, find, results);

    const dates = el('div', 'leg-dates');
    const from = el('input');
    const to = el('input');
    [from, to].forEach((d) => { d.type = 'date'; d.min = today; });
    from.value = leg.from;
    to.value = leg.to;
    from.setAttribute('aria-label', `${i + 1}つ目の行き先の最初の日`);
    to.setAttribute('aria-label', `${i + 1}つ目の行き先の最後の日`);
    from.addEventListener('change', () => {
      leg.from = from.value;
      if (leg.to < leg.from) { leg.to = leg.from; to.value = leg.to; }
    });
    to.addEventListener('change', () => {
      leg.to = to.value;
      if (leg.to < leg.from) { leg.from = leg.to; from.value = leg.from; }
    });
    dates.append(from, el('span', null, '〜'), to);

    row.append(num, wrap, dates);
    if (trip.legs.length > 1) {
      const del = el('button', 'leg-del', '×');
      del.type = 'button';
      del.setAttribute('aria-label', `${i + 1}つ目の行き先を削除`);
      del.addEventListener('click', () => { trip.legs.splice(i, 1); renderLegs(); });
      row.append(del);
    }
    return row;
  }));
}

function renderSavedTrips() {
  const box = $('trip-saved');
  box.hidden = trips.length === 0;
  box.replaceChildren(el('span', 'chips-label saved-label', '保存した旅行'), ...trips.map((t) => {
    const chip = el('span', `chip${trip && t.id === trip.id ? ' on' : ''}`);
    const from = t.legs.map((l) => l.from).sort()[0];
    const go = el('button', 'chip-main', `${t.name}（${dateLabel(from).replace(/（.）/, '')}〜）`);
    go.type = 'button';
    go.addEventListener('click', () => {
      trip = structuredClone(t);
      renderTripForm();
      runTrip();
    });
    const del = el('button', 'chip-del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', `${t.name} を削除`);
    del.addEventListener('click', () => {
      trips = trips.filter((x) => x.id !== t.id);
      store.set('trips', trips);
      const checks = store.get('checks', {});
      delete checks[`trip:${t.id}`];
      store.set('checks', checks);
      if (trip.id === t.id) { trip = newTrip(); renderTripForm(); $('trip-result').hidden = true; }
      renderSavedTrips();
    });
    chip.append(go, del);
    return chip;
  }));
}

async function runTrip() {
  const today = toISO(new Date());
  tripStatus('準備中…');
  try {
    // 検索ボタンを押していない行き先は、いちばん上の候補にする
    for (const leg of trip.legs) {
      if (!leg.place && leg.q.trim()) leg.place = (await searchPlaces(leg.q.trim()))[0] || null;
    }
  } catch (err) { tripStatus(err.message, true); return; }

  const legs = trip.legs.filter((l) => l.place);
  if (legs.length === 0) { tripStatus('行き先を入力してください', true); return; }
  if (legs.length < trip.legs.filter((l) => l.q.trim()).length) { tripStatus('見つからない行き先があります。地名を確かめてください', true); return; }
  if (legs.some((l) => !l.from || !l.to)) { tripStatus('日付を入れてください', true); return; }
  if (legs.some((l) => l.from < today)) { tripStatus('過ぎた日は選べません。今日以降の日付にしてください', true); return; }
  const from = legs.map((l) => l.from).sort()[0];
  const to = legs.map((l) => l.to).sort().at(-1);
  if (daysBetween(from, to).length > MAX_TRIP_DAYS) { tripStatus(`旅行の期間は${MAX_TRIP_DAYS}日以内にしてください`, true); return; }

  trip.name = $('trip-name').value.trim() || [...new Set(legs.map((l) => l.place.name))].join('・');
  const homeKey = $('trip-home').value;
  trip.home = homeKey ? [...tripHomeChoices(), trip.home].find((p) => p && placeKey(p) === homeKey) || null : null;

  tripStatus('天気を取得中…');
  try {
    const [dayLists, homeDays] = await Promise.all([
      Promise.all(legs.map((l) => fetchTripDays(l.place, l.from, l.to))),
      trip.home ? fetchTripDays(trip.home, from, to).catch(() => null) : null,
    ]);
    const days = dayLists.flat().sort((a, b) => a.date.localeCompare(b.date));
    if (days.length === 0) { tripStatus('天気データが見つかりませんでした', true); return; }

    // 保存（同じ旅行は上書き）
    if (!trip.id) trip.id = Date.now().toString(36);
    const saved = { id: trip.id, name: trip.name, home: trip.home, legs: legs.map(({ place, from: f, to: t }) => ({ place, q: place.name, from: f, to: t })) };
    trips = [saved, ...trips.filter((t) => t.id !== trip.id)].slice(0, 10);
    store.set('trips', trips);
    renderSavedTrips();

    renderTripResult(days, homeDays, from, to);
    tripStatus('');
  } catch (err) {
    tripStatus(err.message || '通信エラーが発生しました', true);
  }
}

function renderTripResult(days, homeDays, from, to) {
  const n = new Set(days.map((d) => d.date)).size; // 行き先の間に空いた日は数えない
  const span = daysBetween(from, to).length;
  $('trip-title').textContent = `${trip.name}　${dateLabel(from)}〜${dateLabel(to)}（${n === span ? `${n}日間` : `${n}日分`}）`;
  $('trip-summary').replaceChildren(...tripSummary(days, homeDays, trip.home).map((t) => el('li', null, t)));

  const multi = new Set(days.map((d) => placeKey(d.place))).size > 1;
  $('trip-days').replaceChildren(...days.map((d) => {
    const wd = new Date(`${d.date}T00:00:00`).getDay();
    const row = el('div', 'day');
    const date = el('div', `date ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}`, dateLabel(d.date));
    if (multi || d.source === 'climate') {
      const sub = el('small', 'sub');
      if (multi) sub.append(d.place.name);
      if (d.source === 'climate') sub.append(el('span', 'src', '平年'));
      date.append(sub);
    }
    const [desc, icon] = weatherOf(d.code);
    const icn = el('div', 'i', icon);
    icn.title = d.source === 'climate' ? `例年：${desc}` : desc;
    const temps = el('div', 'temps');
    temps.append(el('span', 'max', fmt(d.dayMax)), ' / ', el('span', 'min', fmt(d.dayMin)));
    const wear = el('div', 'wear');
    const outfit = el('span', 'wear-outfit');
    const mini = el('span', 'mini-fig');
    mini.innerHTML = figureSVG({ ...d.outfit.fig, label: d.outfit.title }, '36 -6 88 160');
    outfit.append(mini, `${d.outfit.title}${d.pop >= 50 ? '＋傘' : ''}`);
    wear.append(outfit);
    row.append(date, icn, temps, el('div', 'pop', `☂ ${d.pop}%`), wear);
    return row;
  }));

  const key = `trip:${trip.id}`;
  renderChecklist($('pack-clothes'), $('pack-clothes-count'), packClothes(days), key);
  renderChecklist($('pack-items'), $('pack-items-count'), packItems(days), key);
  $('trip-result').hidden = false;
}

$('leg-add').addEventListener('click', () => {
  const last = trip.legs.at(-1);
  const from = last?.to ? addDays(last.to, 1) : addDays(toISO(new Date()), 1);
  trip.legs.push({ place: null, q: '', from, to: from });
  renderLegs();
  $('legs').querySelector('.leg:last-child input').focus();
});
$('trip-name').addEventListener('input', () => { trip.name = $('trip-name').value; });
$('trip-run').addEventListener('click', runTrip);
$('trip-new').addEventListener('click', () => {
  trip = newTrip();
  renderTripForm();
  $('trip-result').hidden = true;
  tripStatus('');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.leg-place')) document.querySelectorAll('.leg-place .search-results').forEach((u) => { u.hidden = true; });
});

// ---------- 画面の切り替え（きょう／旅行） ----------
function setMode(mode) {
  $('today-view').hidden = mode !== 'today';
  $('trip-view').hidden = mode !== 'trip';
  document.querySelectorAll('.mode-tabs button').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  if (mode === 'trip') {
    if (!trip) trip = newTrip();
    renderTripForm();
  }
}
document.querySelectorAll('.mode-tabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

// ---------- 起動 ----------
// 通知（Android など）に必要。ファイルを直接開いたときは登録できないので無視する
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
initSettings();
renderFavorites();
scheduleNotify();
loadPlace(store.get('last', null) || favorites[0] || PRESETS[2]);
