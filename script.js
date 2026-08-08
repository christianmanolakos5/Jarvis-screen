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

  // While Jarvis talks, drive the bars with a syllable-like rhythm so the
  // circle visibly moves and glows to the beat of its voice.
  if (speaking) {
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

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  // Names that exist on iOS/Safari first, then desktop Chrome.
  const prefs = ["Daniel","Arthur","Aaron","Google UK English Male","Microsoft Ryan",
    "Microsoft Guy","Google UK English","Alex","Samantha","Microsoft David"];
  for (const name of prefs) {
    const v = voices.find((x) => x.name === name);
    if (v) { preferredVoice = v; return; }
  }
  // Prefer an on-device (local) English voice — remote voices can fail silently on iOS.
  preferredVoice =
    voices.find((v) => v.lang && v.lang.startsWith("en") && v.localService) ||
    voices.find((v) => v.lang && v.lang.startsWith("en")) ||
    voices[0] || null;
}
speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();

function speak(text, onDone) {
  addLine("jarvis", text);

  // --- 1. Start the talking animation FIRST. Nothing above this line can throw,
  //        so the circle always moves to the beat even if speech itself fails.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    speaking = false;
    el.reactor.classList.remove("speaking");
    el.coreLabel.textContent = listening ? "LISTENING" : "STANDBY";
    targetEnergy = 0.2;
    if (onDone) onDone();
  };
  speaking = true;
  el.reactor.classList.add("speaking");
  el.coreLabel.textContent = "SPEAKING";
  // Safety net: end the animation (and run onDone) even if the speech engine
  // never fires onstart/onend — a known iOS quirk.
  const estMs = Math.max(1600, text.length * 70);
  const guard = setTimeout(finish, estMs);

  if (muted || !("speechSynthesis" in window)) return;

  // --- 2. Everything that touches the speech engine is guarded.
  try {
    // iOS Safari bug: cancel() must NOT be called blindly before speak(), or
    // the engine goes silent. Only clear the queue if something is playing.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.0; u.pitch = 0.9; u.volume = 1;
    // Assigning a bad/remote voice can throw or go silent — never fatal.
    try {
      if (preferredVoice && preferredVoice.localService !== false) u.voice = preferredVoice;
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

  if (has("hello","hi ","hey","jarvis","are you there","you there"))
    return `${greetingByTime()}, ${USER_NAME}. All systems are online and at your service.`;
  if (has("your name","who are you","what are you"))
    return `I am J.A.R.V.I.S. — your personal interface, ${USER_NAME}. Just A Rather Very Intelligent System.`;
  if (has("who am i","my name","call me"))
    return `You are ${USER_NAME}, of course. My favorite person to assist.`;
  if (has("how are you","how do you do","you doing"))
    return `Running at full capacity and feeling quite intelligent, thank you for asking, ${USER_NAME}.`;

  if (has("time")) {
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

  return `I heard "${raw}", ${USER_NAME}, but I am not yet programmed for that. ` +
    `Try asking about the time, the weather, or say "what can you do".`;
}

function processInput(text) {
  const reply = handleCommand(text);
  if (reply) speak(reply);
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
  recog.onresult = (e) => { processInput(e.results[0][0].transcript); };
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed")
      speak(`I could not access the microphone, ${USER_NAME}. Please grant permission and tap the circle again.`);
  };
  recog.onend = () => { listening = false; setMicUI("idle"); populateDevices(); };
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
    recState = "idle"; listening = false; setMicUI("idle");
    setStatus("Microphone blocked — enable it for this site in Safari settings, Christian.");
    speak(`I could not access the microphone, ${USER_NAME}.`);
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
    setStatus("I didn't catch anything, Christian. Tap the circle and try again.");
    return;
  }

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

/* ONE TAP: greet, then start listening automatically.
   Tapping anywhere on the screen counts, so the tap can never "miss". */
function onReactorTap() {
  unlockAudio();
  if (!activated) {
    activated = true;
    setMicUI("idle");
    el.coreLabel.textContent = "ONLINE";
    setStatus("Listening right after the greeting — just speak, Christian.");
    chime();
    // Greet, then open the mic on its own: one tap does everything.
    speak(`Hello ${USER_NAME}, how can I help you?`, () => {
      if (!listening && recState !== "recording") toggleVoice();
    });
    return;
  }
  toggleVoice();
}

/* Any tap on the page triggers it (pointerup fires reliably on iOS Safari). */
document.addEventListener("pointerup", onReactorTap);

/* Desktop convenience: press SPACE to talk. */
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); onReactorTap(); }
});

/* ============================================================
   11. BOOT
   ============================================================ */
window.addEventListener("load", () => {
  el.coreLabel.textContent = "STANDBY";
  el.npArtist.textContent = "J.A.R.V.I.S.";
  el.npTrack.textContent = "Systems Online";
  setMicUI("idle");
});
