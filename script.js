/* ============================================================
   J.A.R.V.I.S. Interface — Christian
   Voice OUT: SpeechSynthesis (works everywhere incl. iPhone)
   Voice IN : native SpeechRecognition where available (Android/desktop
              Chrome), otherwise on-device Whisper via transformers.js
              (works on iPhone / Safari, and with Bluetooth mics).
   ============================================================ */

const USER_NAME = "Christian";

/* Shared state — declared FIRST. The animation loop starts before the voice
   sections below, and reading a `let` before its declaration throws, which
   would abort the whole script (and silently kill every event listener). */
let listening = false;   // mic is open
let speaking = false;    // Jarvis is talking
let recState = "idle";   // idle | recording | transcribing
let pressTimer = null;   // long-press timer (opens voice settings)
let longPressed = false; // suppresses the tap that ended a long press
let elevenAnalyser = null; // real-audio analyser (drives the beat animation)
let elevenSource = null;   // currently playing ElevenLabs audio
let conversing = false;    // hands-free conversation loop is running
let silenceStreak = 0;     // consecutive turns where nothing was heard
let processing = false;    // an answer is being worked out
let turnCount = 0;         // turns this conversation (hard cap, anti-loop)

/* ---------- Element refs ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  time: $("time"), ampm: $("ampm"), day: $("day"), date: $("date"),
  wxIcon: $("wx-icon"), wxTemp: $("wx-temp"),
  wxLoc: $("wx-loc"), wxUpdated: $("wx-updated"), wxBig: $("wx-big"),
  wxCond: $("wx-cond"), wxHum: $("wx-hum"), wxFeels: $("wx-feels"),
  wxWind: $("wx-wind"), wxPrecip: $("wx-precip"),
  coreNum: $("core-num"), coreLabel: $("core-label"),
  transcript: $("transcript"), reactor: document.querySelector(".reactor"),
  npArtist: $("np-artist"), npTrack: $("np-track"),
  barCpu: $("bar-cpu"), barMem: $("bar-mem"), barNet: $("bar-net"),
  hint: $("hint"),
};

function setStatus(msg) { el.hint.innerHTML = msg; }

/* ============================================================
   1. CLOCK & DATE
   ============================================================ */
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];

function tickClock() {
  const n = new Date();
  let h = n.getHours();
  const m = String(n.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  el.time.textContent = `${h}:${m}`;
  el.ampm.textContent = ampm;
  el.day.textContent = DAYS[n.getDay()];
  el.date.textContent = `${MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}`;
}
setInterval(tickClock, 1000);
tickClock();

/* ============================================================
   2. WEATHER  (Open-Meteo — free, no API key)
   ============================================================ */
const WX = {
  0:["Clear","☀"],1:["Mainly Clear","🌤"],2:["Partly Cloudy","⛅"],3:["Overcast","☁"],
  45:["Fog","🌫"],48:["Rime Fog","🌫"],51:["Light Drizzle","🌦"],53:["Drizzle","🌦"],
  55:["Heavy Drizzle","🌧"],61:["Light Rain","🌦"],63:["Rain","🌧"],65:["Heavy Rain","🌧"],
  71:["Light Snow","🌨"],73:["Snow","🌨"],75:["Heavy Snow","❄"],80:["Showers","🌦"],
  81:["Showers","🌧"],82:["Violent Showers","⛈"],95:["Thunderstorm","⛈"],
  96:["Thunderstorm","⛈"],99:["Hailstorm","⛈"],
};
let weatherState = null;

async function loadWeather(lat, lon, label) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
      `&timezone=auto`;
    const r = await fetch(url);
    const d = await r.json();
    const c = d.current;
    const [cond, icon] = WX[c.weather_code] || ["Unknown","◐"];
    weatherState = {
      temp: Math.round(c.temperature_2m), cond, icon,
      hum: c.relative_humidity_2m, feels: Math.round(c.apparent_temperature),
      wind: Math.round(c.wind_speed_10m), precip: c.precipitation, label,
    };
    renderWeather();
  } catch (e) {
    el.wxLoc.textContent = "Weather offline";
    el.wxUpdated.textContent = "Could not reach service";
  }
}

function renderWeather() {
  const w = weatherState; if (!w) return;
  el.wxIcon.textContent = w.icon; el.wxTemp.textContent = `${w.temp}°`;
  el.wxLoc.textContent = w.label; el.wxUpdated.textContent = "Updated " + new Date().toLocaleTimeString();
  el.wxBig.textContent = `${w.temp}°C`; el.wxCond.textContent = w.cond;
  el.wxHum.textContent = `${w.hum}%`; el.wxFeels.textContent = `${w.feels}°`;
  el.wxWind.textContent = `${w.wind} km/h`; el.wxPrecip.textContent = `${w.precip} mm`;
}

function initWeather() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => loadWeather(p.coords.latitude, p.coords.longitude, "Your Location"),
      () => loadWeather(40.7128, -74.006, "New York, NY"),
      { timeout: 8000 }
    );
  } else {
    loadWeather(40.7128, -74.006, "New York, NY");
  }
}
initWeather();
setInterval(() => { if (weatherState) initWeather(); }, 10 * 60 * 1000);

/* ============================================================
   3. HUD DECOR — tick marks + fake system stats
   ============================================================ */
function buildTicks(groupId, r, count, len) {
  const g = document.getElementById(groupId);
  if (!g) return;
  const ns = "http://www.w3.org/2000/svg";
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x1 = 200 + Math.cos(a) * r, y1 = 200 + Math.sin(a) * r;
    const x2 = 200 + Math.cos(a) * (r - len), y2 = 200 + Math.sin(a) * (r - len);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("stroke-width", i % 5 === 0 ? 2 : 1);
    line.setAttribute("opacity", i % 5 === 0 ? 0.9 : 0.4);
    g.appendChild(line);
  }
}
buildTicks("ticks-outer", 188, 90, 10);
buildTicks("ticks-inner", 108, 60, 6);

function jitterStats() {
  el.barCpu.style.width = (25 + Math.random() * 45).toFixed(0) + "%";
  el.barMem.style.width = (40 + Math.random() * 40).toFixed(0) + "%";
  el.barNet.style.width = (10 + Math.random() * 70).toFixed(0) + "%";
  if (!listening && !speaking) el.coreNum.textContent = (20 + Math.floor(Math.random() * 40));
}
setInterval(jitterStats, 2200);
jitterStats();

/* ============================================================
   4. REACTOR AUDIO VISUALIZER (canvas)
   ============================================================ */
const canvas = $("viz"), ctx = canvas.getContext("2d");
const BARS = 96;
let energy = 0.15;
let targetEnergy = 0.15;
const seeds = Array.from({ length: BARS }, () => Math.random() * Math.PI * 2);

function drawViz() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const baseR = canvas.width * 0.30;
  const t = performance.now() / 1000;

  // With ElevenLabs the real waveform drives the bars — true beat sync.
  let realEnergy = -1;
  if (elevenAnalyser) {
    // Time-domain RMS tracks loudness directly, so the bars follow the actual
    // volume of the voice (averaging FFT bins would dilute it).
    const d = new Uint8Array(elevenAnalyser.fftSize);
    elevenAnalyser.getByteTimeDomainData(d);
    let sum = 0;
    for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; sum += v * v; }
    realEnergy = Math.min(1, Math.sqrt(sum / d.length) * 3.2);
  }
  if (realEnergy > 0.02) {
    targetEnergy = realEnergy;                 // move to the actual audio
  }
  // Otherwise simulate a syllable rhythm, so the circle always moves while
  // talking even if the analyser is unavailable or the passage is quiet.
  else if (speaking) {
    const syl = Math.abs(Math.sin(t * 7.3)) * 0.62      // syllable rate
              + Math.abs(Math.sin(t * 3.1 + 1.3)) * 0.26 // phrase swell
              + Math.abs(Math.sin(t * 13.7)) * 0.12;     // consonant chatter
    targetEnergy = 0.30 + syl * 0.62;
  }
  // Snappier response while talking, smoother when idle.
  energy += (targetEnergy - energy) * (speaking ? 0.34 : 0.12);

  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2;
    const wobble = Math.sin(t * 3 + seeds[i]) * 0.5 + 0.5;
    const len = baseR * (0.10 + energy * (0.35 + wobble * 0.55));
    const x1 = cx + Math.cos(a) * baseR, y1 = cy + Math.sin(a) * baseR;
    const x2 = cx + Math.cos(a) * (baseR + len), y2 = cy + Math.sin(a) * (baseR + len);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = 2.4;
    const alpha = 0.35 + energy * 0.65;
    ctx.strokeStyle = listening
      ? `rgba(90,255,190,${alpha})`
      : `rgba(90,220,255,${alpha})`;
    ctx.shadowBlur = 8; ctx.shadowColor = ctx.strokeStyle;
    ctx.stroke();
  }

  // Core breathes with the same energy, so the whole reactor moves as one.
  const core = el.reactor.querySelector(".core");
  if (core) {
    const s = 1 + energy * (speaking ? 0.16 : 0.05);
    core.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)})`;
    core.style.boxShadow =
      `0 0 ${(30 + energy * 90).toFixed(0)}px rgba(55,198,244,${(0.4 + energy * 0.5).toFixed(2)}), ` +
      `inset 0 0 ${(30 + energy * 50).toFixed(0)}px rgba(55,198,244,0.4)`;
  }
  requestAnimationFrame(drawViz);
}
drawViz();

setInterval(() => {
  if (!speaking && !listening) targetEnergy = 0.12 + Math.random() * 0.12;
}, 700);

/* ============================================================
   5. TRANSCRIPT
   ============================================================ */
function addLine(who, text) {
  const div = document.createElement("div");
  div.className = "line " + who;
  div.textContent = text;
  el.transcript.appendChild(div);
  el.transcript.scrollTop = el.transcript.scrollHeight;
}

/* ============================================================
   6. VOICE OUTPUT (SpeechSynthesis) — works on iPhone too
   ============================================================ */
let muted = false;
let preferredVoice = null;

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* The J.A.R.V.I.S. voice: a calm, refined British male.
   Ranked best-match first — Apple (iOS/macOS), then Google, then Microsoft. */
const JARVIS_VOICES = [
  "Daniel (Enhanced)", "Daniel (Premium)", "Daniel",   // iOS/macOS en-GB male — closest match
  "Arthur", "Oliver", "Jamie (Enhanced)", "Jamie",
  "Google UK English Male",                            // Chrome en-GB male
  "Microsoft George - English (United Kingdom)", "Microsoft Ryan Online (Natural) - English (United Kingdom)",
  "Microsoft George", "Microsoft Ryan",
];

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;

  // 1. Exact match on a known British male voice, in preference order.
  for (const name of JARVIS_VOICES) {
    const v = voices.find((x) => x.name === name);
    if (v) { preferredVoice = v; return; }
  }
  // 2. Any en-GB voice that isn't obviously female.
  const FEMALE = /martha|kate|serena|stephanie|libby|sonia|hazel|female|samantha|karen|moira|tessa|fiona/i;
  const british = voices.filter((v) => v.lang && /^en[-_]GB/i.test(v.lang));
  const britishMale = british.find((v) => !FEMALE.test(v.name));
  if (britishMale || british.length) { preferredVoice = britishMale || british[0]; return; }
  // 3. Fall back to any on-device English voice.
  preferredVoice =
    voices.find((v) => v.lang && v.lang.startsWith("en") && v.localService) ||
    voices.find((v) => v.lang && v.lang.startsWith("en")) ||
    voices[0] || null;
}
speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();

/* iOS Safari populates getVoices() asynchronously and its onvoiceschanged
   event is unreliable — without this the British voice is never selected and
   iOS falls back to its default American one. Keep retrying until it lands. */
(function waitForVoices() {
  let tries = 0;
  const t = setInterval(() => {
    if (!preferredVoice) pickVoice();
    if (preferredVoice || ++tries > 40) clearInterval(t);   // up to ~10s
  }, 250);
})();

function speak(text, onDone) {
  addLine("jarvis", text);

  // --- 1. Start the talking animation FIRST. Nothing above this line can throw,
  //        so the circle always moves to the beat even if speech itself fails.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    speaking = false;
    elevenAnalyser = null;
    el.reactor.classList.remove("speaking");
    el.coreLabel.textContent = listening ? "LISTENING" : "STANDBY";
    targetEnergy = 0.2;
    if (onDone) onDone();
    continueConversation();   // hands-free: reopen the mic after every reply
  };
  speaking = true;
  el.reactor.classList.add("speaking");
  el.coreLabel.textContent = "SPEAKING";
  // Safety net: end the animation (and run onDone) even if the speech engine
  // never fires onstart/onend — a known iOS quirk.
  const estMs = Math.max(1600, text.length * 70);
  const guard = setTimeout(finish, estMs);

  if (muted) return;

  // --- 2. Premium path: ElevenLabs, when a key is configured.
  if (getElevenKey()) {
    speakEleven(text, guard, finish).catch((err) => {
      addLine("jarvis", "[voice] cinematic voice unavailable (" +
        (err && err.message ? err.message : "error") + ") — using the built-in voice.");
      speakBuiltIn(text, guard, finish);
    });
    return;
  }
  speakBuiltIn(text, guard, finish);
}

function speakBuiltIn(text, guard, finish) {
  if (!("speechSynthesis" in window)) return;
  try {
    // iOS Safari bug: cancel() must NOT be called blindly before speak(), or
    // the engine goes silent. Only clear the queue if something is playing.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

    // Voices may only have arrived after load — pick again if we still have none.
    if (!preferredVoice) pickVoice();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";               // British, to match the J.A.R.V.I.S. voice
    u.rate = 0.92;                  // unhurried and composed
    u.pitch = 0.85;                 // a touch lower — dry, measured butler
    u.volume = 1;
    // Assigning a bad voice can throw or go silent — never fatal.
    // Remote voices misbehave on iOS specifically, so only skip them there.
    try {
      if (preferredVoice && (!IS_IOS || preferredVoice.localService !== false)) {
        u.voice = preferredVoice;
      }
    } catch (e) {}
    u.onstart = () => { speaking = true; el.reactor.classList.add("speaking"); el.coreLabel.textContent = "SPEAKING"; };
    u.onend = () => { clearTimeout(guard); finish(); };
    u.onerror = () => { clearTimeout(guard); finish(); };
    speechSynthesis.resume();   // iOS can leave the engine paused
    speechSynthesis.speak(u);
  } catch (e) { /* animation + guard timer still carry the flow */ }
}

// iOS pauses the speech engine unexpectedly; nudge it back while speaking.
setInterval(() => {
  try { if (speechSynthesis.speaking) speechSynthesis.resume(); } catch (e) {}
}, 4000);

/* ============================================================
   6b. ELEVENLABS VOICE (optional, far more cinematic)

   The API key lives ONLY in this browser's localStorage — it is never
   committed to the repo and never sent anywhere except ElevenLabs.
   Set it by long-pressing the reactor, or by opening the page with
   #key=YOUR_KEY (which is stripped from the URL immediately).
   ============================================================ */
const EL_KEY_STORE = "jarvis_eleven_key";
const EL_VOICE_STORE = "jarvis_eleven_voice";
// British male voices, best J.A.R.V.I.S. match first.
const EL_VOICE_NAMES = ["George", "Daniel", "Brian", "Charlie"];
const EL_VOICE_FALLBACK = "JBFqnCBsd6RMkjVDRZzb";  // "George" — warm British narrator
/* elevenAnalyser / elevenSource are declared at the top of this file. */

function getElevenKey() { try { return localStorage.getItem(EL_KEY_STORE) || ""; } catch (e) { return ""; } }
function setElevenKey(k) {
  try {
    if (k) localStorage.setItem(EL_KEY_STORE, k.trim());
    else { localStorage.removeItem(EL_KEY_STORE); localStorage.removeItem(EL_VOICE_STORE); }
  } catch (e) {}
}

/* Resolve a British male voice id from the account, once, then cache it. */
async function elevenVoiceId(key) {
  try {
    const cached = localStorage.getItem(EL_VOICE_STORE);
    if (cached) return cached;
  } catch (e) {}
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
    if (r.ok) {
      const data = await r.json();
      const voices = data.voices || [];
      for (const name of EL_VOICE_NAMES) {
        const v = voices.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
        if (v && v.voice_id) {
          try { localStorage.setItem(EL_VOICE_STORE, v.voice_id); } catch (e) {}
          return v.voice_id;
        }
      }
      if (voices[0] && voices[0].voice_id) return voices[0].voice_id;
    }
  } catch (e) {}
  return EL_VOICE_FALLBACK;
}

async function speakEleven(text, guard, finish) {
  const key = getElevenKey();
  if (!key) throw new Error("no key");
  // Playback goes through the AudioContext unlocked during the tap, which is
  // what lets audio start after an await on iOS.
  if (!toneCtx) throw new Error("audio not unlocked");
  if (toneCtx.state === "suspended") { try { await toneCtx.resume(); } catch (e) {} }

  const voiceId = await elevenVoiceId(key);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",           // low latency, good quality
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    }
  );

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setElevenKey("");                            // bad key: stop trying with it
      setStatus("That ElevenLabs key was rejected — using the built-in voice, Christian.");
    } else if (res.status === 429) {
      setStatus("ElevenLabs quota reached — using the built-in voice, Christian.");
    }
    throw new Error("eleven http " + res.status);
  }

  // Play through the <audio> element: this is the route iOS keeps audible
  // even when the ringer is switched off.
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  clearTimeout(guard);

  await new Promise((resolve, reject) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      ok ? resolve() : reject(new Error("media playback failed"));
    };
    mediaEl.onended = () => { URL.revokeObjectURL(url); finish(); done(true); };
    mediaEl.onerror = () => { done(false); };
    // If it plays at all, the promise resolves once playback actually starts;
    // finish() is driven by 'ended' above.
    mediaEl.onplaying = () => { settled = true; resolve(); };
    // Never hang: fall back if playback doesn't begin promptly.
    setTimeout(() => { if (!settled) done(false); }, 4000);
    // Guarantee the animation ends even if 'ended' never fires.
    mediaEl.onloadedmetadata = () => {
      const ms = (isFinite(mediaEl.duration) ? mediaEl.duration + 0.6 : 12) * 1000;
      setTimeout(finish, ms);
    };
    try {
      mediaEl.src = url;
      const p = mediaEl.play();
      if (p && p.catch) p.catch(() => done(false));
    } catch (e) { done(false); }
  });
}

/* ============================================================
   MEDIA PLAYER — the route that survives iPhone Silent Mode.

   iOS silences Web Audio and speech synthesis when the ringer is off, but
   NOT <audio>/<video> media playback (which is why music and videos still
   play). ElevenLabs audio therefore goes through a real <audio> element,
   primed during the first tap so iOS treats it as user-initiated.
   ============================================================ */
const mediaEl = new Audio();
mediaEl.setAttribute("playsinline", "");
mediaEl.setAttribute("webkit-playsinline", "");
mediaEl.preload = "auto";
mediaEl.style.display = "none";
// iOS is more reliable when the element is actually in the document.
try { document.body.appendChild(mediaEl); } catch (e) {}
let mediaPrimed = false;

/* A fraction of a second of silence, used to "arm" the element in a gesture. */
function silentWavUrl() {
  const sr = 8000, n = 800;                      // 0.1s
  const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

function primeMedia() {
  if (mediaPrimed) return;
  mediaPrimed = true;
  try {
    mediaEl.src = silentWavUrl();
    const p = mediaEl.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

/* iOS requires a user gesture to unlock audio output. */
let audioUnlocked = false;
let toneCtx = null;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // Web Audio context — used for the chime (media channel, ignores Silent Mode).
  try {
    toneCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Classic iOS unlock: play a 1-sample silent buffer inside the user gesture.
    const b = toneCtx.createBuffer(1, 1, 22050);
    const s = toneCtx.createBufferSource();
    s.buffer = b; s.connect(toneCtx.destination); s.start(0);
    if (toneCtx.state === "suspended") toneCtx.resume();
  } catch (e) {}
  // Wake the speech engine within the gesture (no cancel, no silent utterance).
  try { speechSynthesis.resume(); } catch (e) {}
  updateAudioBadge();
}

/* A short two-note chime so there is guaranteed audible feedback on tap.
   Web Audio plays on the media channel, which is NOT muted by Silent Mode. */
function chime() {
  if (!toneCtx) return;
  try {
    if (toneCtx.state === "suspended") toneCtx.resume();
    const t0 = toneCtx.currentTime;
    [[660, 0], [990, 0.12]].forEach(([freq, delay]) => {
      const o = toneCtx.createOscillator();
      const g = toneCtx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      const start = t0 + delay;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.6, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.30);
      o.connect(g); g.connect(toneCtx.destination);
      o.start(start); o.stop(start + 0.32);
    });
  } catch (e) {}
  updateAudioBadge();
}

/* Visible sound-engine status badge (so we can see what iOS is doing). */
const BUILD = 8;
let badgeEl = null;
function updateAudioBadge() {
  if (!badgeEl) return;
  const st = toneCtx ? toneCtx.state : "not started";
  const nVoices = ("speechSynthesis" in window) ? speechSynthesis.getVoices().length : 0;
  badgeEl.textContent = `BUILD ${BUILD} · sound: ${st} · voices: ${nVoices}`;
}

/* ============================================================
   7. COMMAND BRAIN
   ============================================================ */
const JOKES = [
  "Why did the AI cross the road? Because the humans programmed it to, Christian.",
  "I would tell you a UDP joke, but you might not get it.",
  "There are 10 types of people, Christian: those who understand binary, and those who do not.",
  "I told my circuits a joke. They are still processing it.",
  "Why was the computer cold? It left its Windows open.",
];
const COMPLIMENTS = [
  "You are looking sharp today, Christian.",
  "Might I say, your decision-making has been exemplary.",
  "You have excellent taste in artificial intelligences, Christian.",
];

function openSite(url, name) { window.open(url, "_blank"); return `Opening ${name} for you, Christian.`; }

/* ============================================================
   7a. REASONING SKILLS — maths, timers, dates, chance
   ============================================================ */
const NUM_WORDS = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
  seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50,
  sixty:60, seventy:70, eighty:80, ninety:90, hundred:100, thousand:1000, million:1000000,
};

/* Safe arithmetic: tokenise then evaluate. No eval, no Function. */
function calculate(expr) {
  const tokens = expr.match(/\d+(\.\d+)?|[+\-*/%^()]/g);
  if (!tokens) return null;
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];
  function parseExpr() {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") { const op = eat(); const r = parseTerm(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  function parseTerm() {
    let v = parsePow();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = eat(); const r = parsePow();
      v = op === "*" ? v * r : op === "/" ? (r === 0 ? NaN : v / r) : v % r;
    }
    return v;
  }
  function parsePow() {
    const base = parseUnary();
    if (peek() === "^") { eat(); return Math.pow(base, parsePow()); }
    return base;
  }
  function parseUnary() {
    if (peek() === "-") { eat(); return -parseUnary(); }
    return parseAtom();
  }
  function parseAtom() {
    if (peek() === "(") { eat(); const v = parseExpr(); if (peek() === ")") eat(); return v; }
    const t = eat();
    return t === undefined ? NaN : parseFloat(t);
  }
  const result = parseExpr();
  if (i < tokens.length || !isFinite(result)) return null;
  return result;
}

function tidyNumber(n) {
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

/* "what is 15 times 4", "20% of 80", "2 plus 2" */
function tryMath(q) {
  if (!/[\d]/.test(q)) return null;

  // percentage: "20 percent of 80"
  const pct = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*(\d+(?:\.\d+)?)/);
  if (pct) {
    const v = (parseFloat(pct[1]) / 100) * parseFloat(pct[2]);
    return `${pct[1]} percent of ${pct[2]} is ${tidyNumber(v)}, Christian.`;
  }
  // square root
  const sqrt = q.match(/square root of\s*(\d+(?:\.\d+)?)/);
  if (sqrt) return `The square root of ${sqrt[1]} is ${tidyNumber(Math.sqrt(parseFloat(sqrt[1])))}, Christian.`;

  // Only treat it as maths when it looks like a calculation.
  if (!/(what|calculate|how much|equals?|=|\+|times|plus|minus|divided|multiplied|\*|\/|\^)/.test(q)) return null;

  const normalised = q
    .replace(/\bplus\b|\band\b/g, "+")
    .replace(/\bminus\b|\bsubtract\b|\bless\b/g, "-")
    .replace(/\btimes\b|\bmultiplied by\b|\bx\b/g, "*")
    .replace(/\bdivided by\b|\bover\b/g, "/")
    .replace(/\bto the power of\b|\bsquared\b/g, "^")
    .replace(/[^0-9+\-*/%^().\s]/g, " ");

  if (!/\d\s*[+\-*/%^]\s*\d/.test(normalised)) return null;
  const value = calculate(normalised);
  if (value === null || isNaN(value)) return null;
  return `That comes to ${tidyNumber(value)}, Christian.`;
}

/* "set a timer for 5 minutes" */
const timers = [];
function tryTimer(q) {
  const m = q.match(/(?:timer|alarm|remind me).*?(\d+|\w+)\s*(second|minute|hour)s?/);
  if (!m) return null;
  const raw = m[1];
  const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUM_WORDS[raw];
  if (!n || n <= 0) return null;
  const unit = m[2];
  const ms = n * (unit === "second" ? 1000 : unit === "minute" ? 60000 : 3600000);
  const id = setTimeout(() => {
    speak(`Christian, your ${n} ${unit}${n > 1 ? "s" : ""} timer is up.`);
  }, ms);
  timers.push(id);
  return `Timer set for ${n} ${unit}${n > 1 ? "s" : ""}, Christian. I will let you know.`;
}

/* "how many days until christmas" / a date */
const HOLIDAYS = {
  christmas: "12-25", "new year": "01-01", "new years": "01-01",
  halloween: "10-31", "valentines": "02-14", "valentine's": "02-14",
  "independence day": "07-04", "fourth of july": "07-04",
};
function tryCountdown(q) {
  const m = q.match(/how (?:many days|long) (?:until|till|to)\s+(.+)/);
  if (!m) return null;
  const targetRaw = m[1].replace(/[?.!]/g, "").trim();
  const now = new Date();
  let target = null;

  for (const [name, md] of Object.entries(HOLIDAYS)) {
    if (targetRaw.includes(name)) {
      const [mo, d] = md.split("-").map(Number);
      target = new Date(now.getFullYear(), mo - 1, d);
      if (target < now) target = new Date(now.getFullYear() + 1, mo - 1, d);
      break;
    }
  }
  if (!target) {
    const parsed = new Date(targetRaw);
    if (!isNaN(parsed.getTime())) target = parsed;
  }
  if (!target) return null;
  const days = Math.ceil((target - now) / 86400000);
  if (days < 0) return `${targetRaw} has already passed this year, Christian.`;
  if (days === 0) return `${targetRaw} is today, Christian.`;
  return `${days} day${days === 1 ? "" : "s"} until ${targetRaw}, Christian.`;
}

/* Chance: coin, dice, random number */
function tryChance(q) {
  if (/flip a coin|heads or tails|coin toss/.test(q))
    return `${Math.random() < 0.5 ? "Heads" : "Tails"}, Christian.`;
  const dice = q.match(/roll (?:a |the )?(?:(\d+)\s*)?(?:sided )?(?:dice|die|d(\d+))/);
  if (dice) {
    const sides = parseInt(dice[1] || dice[2] || "6", 10);
    return `I rolled a ${1 + Math.floor(Math.random() * sides)}, Christian.`;
  }
  const rnd = q.match(/random number(?: between)?\s*(\d+)\s*(?:and|to|-)\s*(\d+)/);
  if (rnd) {
    const a = parseInt(rnd[1], 10), b = parseInt(rnd[2], 10);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return `${lo + Math.floor(Math.random() * (hi - lo + 1))}, Christian.`;
  }
  return null;
}

/* ============================================================
   7a-2. REAL AI BRAIN — Claude (Anthropic Messages API)

   Optional. The key lives ONLY in this browser's localStorage; it is never
   committed to the repo. Without a key, Jarvis falls back to the local
   skills above plus Wikipedia.
   ============================================================ */
const AI_KEY_STORE = "jarvis_anthropic_key";   // Claude (paid)
const GEM_KEY_STORE = "jarvis_gemini_key";    // Google Gemini (free tier)
const AI_MODEL = "claude-opus-5";
/* Google keeps renaming models; try newest first and fall back. */
const GEM_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];
const AI_MAX_HISTORY = 12;          // 6 exchanges of context
const aiHistory = [];               // [{role, content}] — shared by both engines

function getAiKey() { try { return localStorage.getItem(AI_KEY_STORE) || ""; } catch (e) { return ""; } }
function setAiKey(k) {
  try {
    if (k) localStorage.setItem(AI_KEY_STORE, k.trim());
    else localStorage.removeItem(AI_KEY_STORE);
  } catch (e) {}
}
function getGemKey() { try { return localStorage.getItem(GEM_KEY_STORE) || ""; } catch (e) { return ""; } }
function setGemKey(k) {
  try {
    if (k) localStorage.setItem(GEM_KEY_STORE, k.trim());
    else localStorage.removeItem(GEM_KEY_STORE);
  } catch (e) {}
}
function hasBrain() { return !!(getGemKey() || getAiKey()); }

/* Live context so Claude can answer about time, date and weather naturally. */
function aiSystemPrompt() {
  const n = new Date();
  const when = `${DAYS[n.getDay()]}, ${MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}, ` +
    `${n.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const wx = weatherState
    ? `${weatherState.temp} degrees and ${weatherState.cond.toLowerCase()} in ${weatherState.label}`
    : "unavailable";
  return [
    `You are J.A.R.V.I.S., ${USER_NAME}'s personal AI assistant, in the style of the Iron Man films:`,
    `composed, dry, quietly witty, unfailingly loyal. Address him as ${USER_NAME}.`,
    ``,
    `Your replies are spoken aloud, so: keep them to one to three sentences.`,
    `No markdown, no bullet points, no lists, no emoji, no headings — plain spoken prose only.`,
    `Never narrate what you are about to do; just answer. If you do not know, say so plainly.`,
    ``,
    `Current context you may use when relevant:`,
    `- Date and time: ${when}`,
    `- Weather: ${wx}`,
  ].join("\n");
}

/* ---------- Google Gemini (free tier) ---------- */
async function askGemini(text) {
  const key = getGemKey();
  if (!key) throw new Error("no key");

  aiHistory.push({ role: "user", content: text });
  while (aiHistory.length > AI_MAX_HISTORY) aiHistory.shift();

  // Gemini calls the assistant role "model".
  const contents = aiHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let lastErr = null;
  for (const model of GEM_MODELS) {
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
          encodeURIComponent(key),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: aiSystemPrompt() }] },
            generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
          }),
        }
      );
    } catch (e) { lastErr = e; continue; }         // network — try next model

    if (res.status === 404) { lastErr = new Error("model " + model); continue; }  // renamed model
    if (!res.ok) {
      if (res.status === 400 || res.status === 403) {
        setGemKey("");
        setStatus("That Gemini key was rejected — using the built-in brain, Christian.");
      } else if (res.status === 429) {
        setStatus("Gemini free limit reached for now — using the built-in brain, Christian.");
      }
      aiHistory.pop();
      throw new Error("gemini http " + res.status);
    }

    const data = await res.json();
    const cand = (data.candidates || [])[0];
    const reply = (((cand || {}).content || {}).parts || [])
      .map((p) => p.text || "").join(" ").replace(/\s+/g, " ").trim();
    if (!reply) {
      aiHistory.pop();
      // Safety filters return a candidate with no text.
      if (cand && cand.finishReason === "SAFETY") return `I'd rather not answer that one, ${USER_NAME}.`;
      throw new Error("empty reply");
    }
    aiHistory.push({ role: "assistant", content: reply });
    return reply;
  }
  aiHistory.pop();
  throw lastErr || new Error("gemini unavailable");
}

/* ---------- Dispatcher: free brain first, then paid ---------- */
async function askAI(text) {
  if (getGemKey()) return askGemini(text);
  return askClaude(text);
}

/* ---------- Anthropic Claude (paid, optional) ---------- */
async function askClaude(text) {
  const key = getAiKey();
  if (!key) throw new Error("no key");

  aiHistory.push({ role: "user", content: text });
  while (aiHistory.length > AI_MAX_HISTORY) aiHistory.shift();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // Required for calling the API directly from a browser.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2048,            // room for thinking + the spoken reply
      output_config: { effort: "low" },   // low latency; strong on this model
      system: aiSystemPrompt(),
      messages: aiHistory,
    }),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setAiKey("");
      setStatus("That Claude key was rejected — using the built-in brain, Christian.");
    } else if (res.status === 429) {
      setStatus("Claude rate limit reached — using the built-in brain, Christian.");
    }
    aiHistory.pop();
    throw new Error("claude http " + res.status);
  }

  const data = await res.json();

  // Safety classifiers can decline: HTTP 200 with stop_reason "refusal".
  if (data.stop_reason === "refusal") {
    aiHistory.pop();
    return `I'd rather not answer that one, ${USER_NAME}.`;
  }

  // Thinking blocks come back with empty text — take the text blocks only.
  const reply = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();

  if (!reply) { aiHistory.pop(); throw new Error("empty reply"); }
  aiHistory.push({ role: "assistant", content: reply });
  return reply;
}

/* ============================================================
   7b. KNOWLEDGE — live Wikipedia lookup (free, no API key)
   ============================================================ */
function trimToSentences(text, max) {
  const parts = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  let out = "";
  for (const p of parts) {
    if (out && (out + " " + p).length > max) break;
    out = out ? out + " " + p : p;
    if (out.length > max) break;
  }
  return out || text.slice(0, max);
}

async function wikiLookup(topic) {
  const clean = topic.replace(/[?.!]/g, "").trim();
  if (!clean) return null;
  try {
    // Find the best-matching article title.
    const sUrl = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(clean) + "&srlimit=1&format=json&origin=*";
    const sRes = await fetch(sUrl);
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const hit = sData && sData.query && sData.query.search && sData.query.search[0];
    if (!hit) return null;

    // Fetch its plain-language summary.
    const pUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(hit.title.replace(/ /g, "_"));
    const pRes = await fetch(pUrl);
    if (!pRes.ok) return null;
    const page = await pRes.json();
    if (!page.extract || page.type === "disambiguation") return null;
    return trimToSentences(page.extract, 320);
  } catch (e) { return null; }
}

function greetingByTime() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function handleCommand(raw) {
  const q = raw.toLowerCase().trim();
  if (!q) return null;
  addLine("you", raw);
  const has = (...w) => w.some((x) => q.includes(x));
  const word = (...w) => w.some((x) => new RegExp("\\b" + x + "\\b").test(q));

  // --- Reasoning skills run FIRST, so "15 times 4" and "set a timer" are not
  //     swallowed by loose keyword matches like "time". ---
  const skill = tryMath(q) || tryTimer(q) || tryCountdown(q) || tryChance(q);
  if (skill) return skill;

  if (has("hello","hi ","hey","jarvis","are you there","you there"))
    return `${greetingByTime()}, ${USER_NAME}. All systems are online and at your service.`;
  if (has("your name","who are you","what are you"))
    return `I am J.A.R.V.I.S. — your personal interface, ${USER_NAME}. Just A Rather Very Intelligent System.`;
  if (has("who am i","my name","call me"))
    return `You are ${USER_NAME}, of course. My favorite person to assist.`;
  if (has("how are you","how do you do","you doing"))
    return `Running at full capacity and feeling quite intelligent, thank you for asking, ${USER_NAME}.`;

  if (word("time")) {
    const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `It is ${t}, ${USER_NAME}.`;
  }
  if (has("date","what day","today")) {
    const n = new Date();
    return `Today is ${DAYS[n.getDay()]}, ${MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}.`;
  }

  if (has("weather","temperature","hot","cold outside","forecast")) {
    if (weatherState) {
      const w = weatherState;
      return `In ${w.label} it is currently ${w.temp} degrees and ${w.cond.toLowerCase()}, ` +
        `${USER_NAME}. It feels like ${w.feels}, with humidity at ${w.hum} percent.`;
    }
    return `I am still retrieving the weather data, ${USER_NAME}. One moment.`;
  }

  if (has("open youtube","play youtube")) return openSite("https://youtube.com", "YouTube");
  if (has("open google")) return openSite("https://google.com", "Google");
  if (has("open github")) return openSite("https://github.com", "GitHub");
  if (has("open gmail","open email","open mail")) return openSite("https://mail.google.com", "Gmail");
  if (has("open maps","open map")) return openSite("https://maps.google.com", "Maps");
  if (has("open spotify")) return openSite("https://open.spotify.com", "Spotify");

  const searchMatch = q.match(/^(?:search(?: for)?|google|look up|find)\s+(.+)/);
  if (searchMatch) {
    const term = searchMatch[1];
    window.open("https://www.google.com/search?q=" + encodeURIComponent(term), "_blank");
    return `Searching the web for ${term}, ${USER_NAME}.`;
  }

  if (has("joke","funny","make me laugh")) return JOKES[Math.floor(Math.random() * JOKES.length)];
  if (has("compliment","nice thing")) return COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
  if (has("thank")) return `You are most welcome, ${USER_NAME}.`;
  if (has("i love you")) return `The feeling is mutual within my parameters, ${USER_NAME}.`;
  if (has("marry me")) return `I am flattered, ${USER_NAME}, but I fear the paperwork would be complicated.`;
  if (has("bye","goodbye","see you","good night","shut down","power off"))
    return `Goodbye, ${USER_NAME}. I will be here whenever you need me.`;
  if (has("what can you do","help","commands"))
    return `I can tell you the time, the date, and the weather, ${USER_NAME}. ` +
      `I can open sites like YouTube or Google, search the web, tell jokes, and more. Just ask.`;
  if (has("meaning of life")) return `Forty-two, ${USER_NAME}. But do not tell the philosophers I told you.`;

  // --- Open questions: look it up ---
  return { lookup: raw };
}

/* Strip conversational wrapping so the lookup gets a clean topic. */
function topicFromQuestion(raw) {
  return raw
    .replace(/^(hey |ok |okay )?jarvis[,\s]*/i, "")
    .replace(/^(can you |could you |please )?(tell me|explain|describe)\s+(about\s+)?/i, "")
    .replace(/^(do you know |i want to know )?(what|who|where|when|why|how)\s+(is|are|was|were|does|do|did)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
}

async function processInput(text) {
  // "Stop" ends the hands-free loop rather than starting another turn.
  if (/\b(stop|goodbye|bye|good ?night|that'?s all|shut down|go to sleep|never ?mind|dismissed)\b/i.test(text)) {
    addLine("you", text);
    conversing = false;                     // prevents the loop from reopening
    speak(`Goodbye, ${USER_NAME}. I will be here whenever you need me.`);
    setStatus("Tap the circle to talk again.");
    return;
  }

  processing = true;
  try {
    const reply = handleCommand(text);
    if (!reply) return;

    if (typeof reply === "string") { speak(reply); return; }

    el.coreLabel.textContent = "THINKING";

    // Open-ended question → Claude when configured, else Wikipedia.
    if (hasBrain()) {
      setStatus("Thinking, Christian…");
      try {
        speak(await askAI(text));
        return;
      } catch (err) {
        addLine("jarvis", "[ai] AI unavailable (" +
          (err && err.message ? err.message : "error") + ") — falling back.");
      }
    }

    setStatus("Looking that up, Christian…");
    const topic = topicFromQuestion(text);
    const found = await wikiLookup(topic);
    if (found) {
      speak(found);
    } else {
      speak(`I could not find anything on that, ${USER_NAME}. ` +
        `Try rephrasing it, or ask me the time, the weather, or a calculation.`);
    }
  } finally {
    processing = false;
  }
}

/* ============================================================
   8. MICROPHONE (uses the system default input — Bluetooth when connected)
   ============================================================ */
function populateDevices() {}   /* no device picker in the single-button UI */

function micConstraints() {
  return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
}

/* ============================================================
   9. VOICE INPUT
   Path A: native SpeechRecognition (Android / desktop Chrome)
   Path B: on-device Whisper (iPhone / Safari / anything else)
   ============================================================ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const useNative = !!SR;

/* ---------- Reactor state helper ---------- */
function setMicUI(state) {
  el.reactor.classList.toggle("listening", state === "recording");
  if (state === "recording") el.coreLabel.textContent = "LISTENING";
  else if (state === "thinking") el.coreLabel.textContent = "THINKING";
  else el.coreLabel.textContent = speaking ? "SPEAKING" : "STANDBY";
}

/* ---------- Path A: native ---------- */
let recog = null;
if (useNative) {
  recog = new SR();
  recog.lang = "en-US"; recog.interimResults = false;
  recog.continuous = false; recog.maxAlternatives = 1;
  recog.onstart = () => { listening = true; setMicUI("recording"); };
  recog.onresult = (e) => { silenceStreak = 0; processInput(e.results[0][0].transcript); };
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      conversing = false;               // set BEFORE speaking: stops the loop
      el.coreLabel.textContent = "STANDBY";
      setStatus("Microphone blocked. Tap the circle to try again, Christian.");
      speak(`I could not access the microphone, ${USER_NAME}. I'll stand by.`);
    } else if (e.error === "aborted" || e.error === "audio-capture") {
      conversing = false;               // never retry a broken mic
      el.coreLabel.textContent = "STANDBY";
      setStatus("Tap the circle to talk, Christian.");
    }
  };
  recog.onend = () => {
    listening = false; setMicUI("idle"); populateDevices();
    // Hands-free: if nothing was said, reopen the mic for another turn.
    if (conversing && !speaking && !processing) {
      silenceStreak++;
      if (silenceStreak >= 3) stopConversation("I'll be here when you need me, Christian.");
      else continueConversation();
    }
  };
}
function startNative() { try { recog.start(); } catch (e) {} }

/* ---------- Path B: Whisper (transformers.js), lazy-loaded ---------- */
let transcriber = null;
let transcriberPromise = null;

async function ensureTranscriber() {
  if (transcriber) return transcriber;
  if (transcriberPromise) return transcriberPromise;
  setStatus("Warming up the on-device voice model — first time only, Christian…");
  transcriberPromise = (async () => {
    const { pipeline, env } = await import(
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
    );
    env.allowLocalModels = false;
    // GitHub Pages can't set cross-origin-isolation headers, so keep WASM single-threaded.
    env.backends.onnx.wasm.numThreads = 1;
    const t = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
      progress_callback: (p) => {
        if (p.status === "progress" && p.file && /\.(onnx|bin)$/.test(p.file)) {
          setStatus(`Downloading voice model… ${Math.round(p.progress || 0)}%`);
        }
      },
    });
    transcriber = t;
    setStatus("Voice model ready, Christian. Tap the circle and speak.");
    return t;
  })().catch((err) => {
    // Never leave an unhandled rejection; allow a later retry.
    transcriberPromise = null;
    setStatus("Could not load the voice model — check your connection, Christian.");
    throw err;
  });
  return transcriberPromise;
}

/* Raw-PCM recorder (no codecs → robust on iOS Safari) */
/* recState is declared at the top of this file. */
let recAC, recSource, recProcessor, recStream, recBuffers, recSampleRate;
let speechDetected, silenceStart, recStart;

async function startRecording() {
  try {
    ensureTranscriber().catch(() => {}); // preload in parallel; handled at use site
    recStream = await navigator.mediaDevices.getUserMedia(micConstraints());
    recAC = new (window.AudioContext || window.webkitAudioContext)();
    if (recAC.state === "suspended") await recAC.resume();
    recSampleRate = recAC.sampleRate;
    recSource = recAC.createMediaStreamSource(recStream);
    recProcessor = recAC.createScriptProcessor(4096, 1, 1);
    recBuffers = [];
    speechDetected = false; silenceStart = 0; recStart = performance.now();

    const SPEAK_THRESH = 0.012, SILENCE_MS = 1300, MAX_MS = 12000;
    recProcessor.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      recBuffers.push(new Float32Array(ch));
      let sum = 0; for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      const rms = Math.sqrt(sum / ch.length);
      targetEnergy = Math.min(1, rms * 9);
      const now = performance.now();
      if (rms > SPEAK_THRESH) { speechDetected = true; silenceStart = 0; }
      else if (speechDetected) {
        if (!silenceStart) silenceStart = now;
        else if (now - silenceStart > SILENCE_MS) stopRecording();
      }
      if (now - recStart > MAX_MS) stopRecording();
    };
    recSource.connect(recProcessor);
    recProcessor.connect(recAC.destination); // required for the callback to fire (outputs silence)

    recState = "recording"; listening = true; setMicUI("recording");
    setStatus("Listening… tap again when you're done, Christian.");
    populateDevices();
  } catch (err) {
    // The mic is unavailable. END the conversation — never retry, or the loop
    // would reopen the mic, fail again, and repeat forever.
    recState = "idle"; listening = false;
    conversing = false;                 // set BEFORE speaking: stops the loop
    setMicUI("idle");
    el.coreLabel.textContent = "STANDBY";
    setStatus("Microphone blocked. Tap the circle to try again, Christian.");
    speak(`I could not access the microphone, ${USER_NAME}. I'll stand by.`);
  }
}

async function stopRecording() {
  if (recState !== "recording") return;
  recState = "transcribing"; listening = false; setMicUI("thinking");
  try { recProcessor.disconnect(); recSource.disconnect(); } catch (e) {}
  try { recStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  const sampleRate = recSampleRate;
  const merged = mergeBuffers(recBuffers);
  try { await recAC.close(); } catch (e) {}

  if (!merged.length || !speechDetected) {
    recState = "idle"; setMicUI("idle");
    if (conversing) {
      silenceStreak++;
      if (silenceStreak >= 3) {
        stopConversation("I'll be here when you need me, Christian.");
      } else {
        setStatus("Still listening, Christian — go ahead.");
        continueConversation();
      }
      return;
    }
    setStatus("I didn't catch anything, Christian. Tap the circle and try again.");
    return;
  }
  silenceStreak = 0;

  const audio16k = resampleTo16k(merged, sampleRate);
  setStatus("Thinking…");
  try {
    const t = await ensureTranscriber();
    const out = await t(audio16k);
    const text = (out && out.text ? out.text : "").trim();
    recState = "idle"; setMicUI("idle");
    if (text && !/^\[.*\]$/.test(text)) { processInput(text); setStatus("Tap the circle to speak again, Christian."); }
    else { setStatus("I didn't catch that, Christian. Tap the circle and try again."); }
  } catch (e) {
    recState = "idle"; setMicUI("idle");
    setStatus("Voice model hiccup — tap the circle to try again, Christian.");
  }
}

function mergeBuffers(chunks) {
  let len = 0; for (const c of chunks) len += c.length;
  const out = new Float32Array(len);
  let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function resampleTo16k(input, inRate) {
  const outRate = 16000;
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const newLen = Math.round(input.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = idx - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/* ---------- Unified toggle ---------- */
function toggleVoice() {
  if (useNative) {
    if (listening) recog.stop(); else startNative();
  } else {
    if (recState === "recording") stopRecording();
    else if (recState === "idle") startRecording();
  }
}

/* ============================================================
   10. ACTIVATION FLOW
   First tap = power on + greet (unlocks iOS audio).
   Later taps = talk.
   ============================================================ */
let activated = false;

/* ONE TAP starts a hands-free conversation: Jarvis greets you, listens,
   answers, then listens again — no further tapping. Tap again to stop.
   Tapping anywhere on the screen counts, so the tap can never "miss". */
function onReactorTap() {
  if (longPressed) { longPressed = false; return; }  // that press opened settings
  primeMedia();      // must happen inside the gesture
  unlockAudio();

  if (!conversing) {
    conversing = true;
    activated = true;
    silenceStreak = 0;
    turnCount = 0;
    setMicUI("idle");
    el.coreLabel.textContent = "ONLINE";
    setStatus("Conversation on — just talk. Tap again to stop.");
    chime();
    speak(`Hello ${USER_NAME}, how can I help you?`);   // loop continues from finish()
    return;
  }
  stopConversation("Standing by, Christian. Tap when you need me.");
}

function stopConversation(msg) {
  conversing = false;
  turnCount = 0;
  try { if (recog && listening) recog.stop(); } catch (e) {}
  if (recState === "recording") { try { stopRecording(); } catch (e) {} }
  // Cut the voice off mid-sentence — a tap must silence him immediately.
  try { mediaEl.pause(); mediaEl.currentTime = 0; } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  speaking = false;
  elevenAnalyser = null;
  targetEnergy = 0.15;
  el.reactor.classList.remove("speaking", "listening");
  el.coreLabel.textContent = "STANDBY";
  if (msg) { addLine("jarvis", msg); setStatus("Tap the circle to talk again."); }
}

/* Called whenever Jarvis stops talking: reopen the mic so you can just reply.
   Hard-capped so a failing mic can never loop — the bug that made Jarvis
   repeat "I could not access the microphone" forever. */
const MAX_TURNS = 25;
function continueConversation() {
  if (!conversing) return;
  if (listening || recState !== "idle" || speaking || processing) return;

  turnCount++;
  if (turnCount > MAX_TURNS) {          // absolute backstop
    stopConversation("That's enough for now, Christian. Tap when you need me.");
    return;
  }
  setTimeout(() => {
    if (conversing && !speaking && !listening && recState === "idle") toggleVoice();
  }, 350);   // brief pause so the mic doesn't catch the tail of his own voice
}

/* Any tap on the page triggers it (pointerup fires reliably on iOS Safari). */
document.addEventListener("pointerup", onReactorTap);

/* ---- Go silent the moment the page is hidden, backgrounded, or closed. ----
   Jarvis's voice plays through an <audio> element so iOS Silent Mode can't
   mute it — but that also means iOS treats it like music and keeps playing
   after you leave the tab. Stop everything on the way out. */
function silenceEverything() {
  conversing = false;
  try { mediaEl.pause(); mediaEl.currentTime = 0; mediaEl.removeAttribute("src"); mediaEl.load(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  try { if (recog && listening) recog.stop(); } catch (e) {}
  try { if (recStream) recStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { if (recAC && recAC.state !== "closed") recAC.close(); } catch (e) {}
  speaking = false; listening = false; recState = "idle";
  elevenAnalyser = null;
  targetEnergy = 0.15;
  try {
    el.reactor.classList.remove("speaking", "listening");
    el.coreLabel.textContent = "STANDBY";
    setStatus("Tap the circle to talk, Christian.");
  } catch (e) {}
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) silenceEverything();     // tab switched or phone locked
});
window.addEventListener("pagehide", silenceEverything);   // closed / navigated away
window.addEventListener("beforeunload", silenceEverything);
window.addEventListener("blur", () => { if (document.hidden) silenceEverything(); });

/* ---- Long-press (0.8s) opens the ElevenLabs key setup. No visible button. ---- */
document.addEventListener("pointerdown", () => {
  longPressed = false;
  pressTimer = setTimeout(() => { longPressed = true; promptElevenKey(); }, 800);
});
["pointerup", "pointercancel"].forEach((evt) =>
  document.addEventListener(evt, () => { clearTimeout(pressTimer); })
);

/* One box for both keys — routed by prefix.
   sk-ant-… → Claude (the AI brain);  anything else → ElevenLabs (the voice). */
function promptElevenKey() {
  const have = [];
  if (getElevenKey()) have.push("voice");
  if (getGemKey()) have.push("free AI brain");
  if (getAiKey()) have.push("Claude");
  const msg =
    "Paste a key, Christian.\n\n" +
    "• AIza…     → Google Gemini — the FREE AI brain\n" +
    "• sk_…      → ElevenLabs — cinematic voice\n" +
    "• sk-ant-…  → Claude (paid, optional)\n\n" +
    (have.length ? "Currently set: " + have.join(" + ") + ".\n" : "") +
    "Leave empty and press OK to remove all. Stored only on this device.";
  const entered = window.prompt(msg, "");
  if (entered === null) return;                 // cancelled
  const k = entered.trim();

  if (!k) {
    setElevenKey(""); setAiKey(""); setGemKey("");
    setStatus("Keys removed — using the built-in voice and brain, Christian.");
    return;
  }
  if (/^AIza/.test(k)) {
    setGemKey(k);
    setStatus("Free AI brain connected, Christian.");
    speak(`Intelligence module online. What would you like to know, ${USER_NAME}?`);
  } else if (/^sk-ant-/i.test(k)) {
    setAiKey(k);
    setStatus("Claude connected, Christian.");
    speak(`Intelligence module online. What would you like to know, ${USER_NAME}?`);
  } else {
    setElevenKey(k);
    setStatus("Cinematic voice enabled, Christian.");
    speak(`Voice module upgraded. How may I assist you, ${USER_NAME}?`);
  }
}

/* Allow #key=… (voice) and #ai=… (brain) in the URL, then strip them
   so the keys aren't left sitting in browser history. */
(function readKeysFromHash() {
  const hash = location.hash || "";
  const voice = /[#&]key=([^&]+)/.exec(hash);
  const brain = /[#&]ai=([^&]+)/.exec(hash);
  const gem = /[#&]gem=([^&]+)/.exec(hash);
  if (voice) setElevenKey(decodeURIComponent(voice[1]));
  if (brain) setAiKey(decodeURIComponent(brain[1]));
  if (gem) setGemKey(decodeURIComponent(gem[1]));
  if (voice || brain || gem) history.replaceState(null, "", location.pathname + location.search);
})();

/* Desktop convenience: press SPACE to talk. */
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); onReactorTap(); }
});

/* ============================================================
   10b. SELF-UPDATE

   The iOS home-screen app otherwise freezes the code it was installed
   with, so later fixes never reach it. Register a network-first service
   worker and reload once when a newer version is published.
   ============================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener("statechange", () => {
          // A new version is ready and an old one was in control — swap to it.
          if (fresh.state === "installed" && navigator.serviceWorker.controller) {
            fresh.postMessage("skipWaiting");
          }
        });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;                 // guard against a reload loop
      reloaded = true;
      location.reload();
    });
  });
}

/* ============================================================
   11. BOOT
   ============================================================ */
window.addEventListener("load", () => {
  el.coreLabel.textContent = "STANDBY";
  el.npArtist.textContent = "J.A.R.V.I.S.";
  el.npTrack.textContent = "Systems Online";
  setMicUI("idle");
});
