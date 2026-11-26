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

// 体感最高気温ベースの服装ランク（上から順に判定）
const OUTFITS = [
  { min: 30, icon: '🎽', title: 'ノースリーブ・半袖', detail: '真夏日。通気性のよい薄手の服で。' },
  { min: 25, icon: '👕', title: '半袖', detail: '半袖Tシャツで快適。冷房対策に薄手の羽織があると安心。' },
  { min: 21, icon: '👔', title: '長袖シャツ・薄手', detail: '長袖シャツやカットソー1枚でちょうどいい気温。' },
  { min: 17, icon: '🧥', title: 'カーディガン・薄手の羽織', detail: '長袖に軽い羽織りを。日なたでは脱げるものが便利。' },
  { min: 13, icon: '🧶', title: 'セーター・ジャケット', detail: 'ニットやジャケットなど、しっかりした長袖を。' },
  { min: 9,  icon: '🧥', title: 'トレンチコート・薄手のコート', detail: 'コートが必要。インナーは長袖＋ニットで。' },
  { min: 5,  icon: '🧥', title: '冬物コート', detail: 'ウールコートなど厚手のアウターを。首元も温かく。' },
  { min: -Infinity, icon: '🧣', title: 'ダウン・マフラー・手袋', detail: '真冬の寒さ。ダウンに防寒小物をフル装備で。' },
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

// offset: 暑がり(+)・寒がり(-)の補正℃ / start,end: 外出時間（時）
const settings = Object.assign({ offset: 0, start: 8, end: 19 }, store.get('settings', {}));
let favorites = store.get('favorites', []);
let state = null; // { place, data }

const placeKey = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
const isFavorite = (p) => favorites.some((f) => placeKey(f) === placeKey(p));

// ---------- 判定ロジック ----------
const outfitFor = (feel) => OUTFITS.find((o) => feel >= o.min);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// 指定日の startH〜endH 時の予報をまとめる
function windowStats(hourly, date, startH, endH) {
  const idx = [];
  hourly.time.forEach((t, i) => {
    const h = Number(t.slice(11, 13));
    if (t.startsWith(date) && h >= startH && h <= endH) idx.push(i);
  });
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

// 昨日との比較（外出時間帯の体感最高気温どうし）
function compareText(today, yesterday) {
  if (!yesterday) return '';
  const diff = Math.round(today.feelMax - yesterday.feelMax);
  if (diff <= -5) return `昨日より体感が ${-diff}℃ 低い。かなり寒く感じます。昨日より厚手の服を。`;
  if (diff <= -2) return `昨日より体感が ${-diff}℃ 低い。昨日より1枚多めに。`;
  if (diff >= 5) return `昨日より体感が ${diff}℃ 高い。昨日よりだいぶ薄着でOK。`;
  if (diff >= 2) return `昨日より体感が ${diff}℃ 高い。昨日より1枚少なめでOK。`;
  return '昨日とほぼ同じ体感。昨日と同じくらいの服装で大丈夫です。';
}

// ---------- API ----------
async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 7, past_days: 1, wind_speed_unit: 'ms',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,relative_humidity_2m,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`天気データの取得に失敗しました（${res.status}）`);
  return res.json();
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

function render() {
  if (!state) return;
  const { place, data } = state;
  const { current, hourly, daily } = data;
  const todayStr = current.time.slice(0, 10);
  const ti = Math.max(0, daily.time.indexOf(todayStr));

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

  // 今日の服装
  const today = dayData(data, ti);
  const yesterday = ti > 0 ? dayData(data, ti - 1) : null;
  $('today-range').textContent = `${fmt(today.dayMax)} / ${fmt(today.dayMin)}`;
  $('window-label').textContent = `（${settings.start}〜${settings.end}時）`;
  $('compare').textContent = compareText(today, yesterday);
  $('compare').hidden = !yesterday;
  $('outfit-icon').textContent = today.outfit.icon;
  $('outfit-title').textContent = today.outfit.title;
  const pref = settings.offset > 0 ? '（暑がり設定）' : settings.offset < 0 ? '（寒がり設定）' : '';
  $('outfit-detail').textContent = `体感 最高 ${fmt(today.feelMax)}・最低 ${fmt(today.feelMin)}${pref}。${today.outfit.detail}`;
  const pos = Math.min(100, Math.max(0, ((today.feelMax + settings.offset + 5) / 40) * 100)); // -5℃〜35℃
  $('index-marker').style.left = `${pos}%`;
  $('advice').replaceChildren(...buildAdvice(today).map((t) => el('li', null, t)));

  const lau = today.laundry;
  $('laundry').replaceChildren();
  if (lau) {
    $('laundry').append(el('span', 'laundry-mark', lau.mark), el('strong', null, `洗濯：${lau.label}`), el('span', null, lau.text));
  }

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
    wear.append(
      el('span', null, `${d.outfit.icon} ${d.outfit.title}${d.pop >= 50 ? '＋傘' : ''}`),
      el('span', 'lau', d.laundry ? `洗濯${d.laundry.mark}` : ''),
    );
    row.append(
      el('div', `date ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}`, `${label}（${WD[wd]}）`),
      icn, temps, el('div', 'pop', `☂ ${d.pop}%`), wear,
    );
    days.push(row);
  }
  $('daily').replaceChildren(...days);

  $('result').hidden = false;
}

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
}

$('fav-btn').addEventListener('click', () => state && toggleFavorite(state.place));

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
}

// ---------- 読み込み ----------
async function loadPlace(place) {
  setStatus(`${place.name} の天気を取得中…`);
  document.querySelectorAll('.presets button').forEach((b) => b.classList.toggle('active', b.textContent === place.name));
  try {
    const data = await fetchForecast(place.lat, place.lon);
    state = { place, data };
    render();
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
    (pos) => loadPlace({ name: '現在地', admin: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
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

// ---------- 起動 ----------
initSettings();
renderFavorites();
loadPlace(store.get('last', null) || favorites[0] || PRESETS[2]);
