/* ============================================================
   J.A.R.V.I.S. Interface — Christian
   Voice OUT: SpeechSynthesis (works everywhere incl. iPhone)
   Voice IN : native SpeechRecognition where available (Android/desktop
              Chrome), otherwise on-device Whisper via transformers.js
              (works on iPhone / Safari, and with Bluetooth mics).
   ============================================================ */

const USER_NAME = "Christian";

/* ---------- Element refs ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  time: $("time"), ampm: $("ampm"), day: $("day"), date: $("date"),
  wxIcon: $("wx-icon"), wxTemp: $("wx-temp"),
  wxLoc: $("wx-loc"), wxUpdated: $("wx-updated"), wxBig: $("wx-big"),
  wxCond: $("wx-cond"), wxHum: $("wx-hum"), wxFeels: $("wx-feels"),
  wxWind: $("wx-wind"), wxPrecip: $("wx-precip"),
  coreNum: $("core-num"), coreLabel: $("core-label"),
  transcript: $("transcript"), micBtn: $("mic-btn"), textInput: $("text-input"),
  muteBtn: $("mute-btn"), reactor: document.querySelector(".reactor"),
  npArtist: $("np-artist"), npTrack: $("np-track"),
  barCpu: $("bar-cpu"), barMem: $("bar-mem"), barNet: $("bar-net"),
  micSelect: $("mic-select"), hint: $("hint"),
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
  energy += (targetEnergy - energy) * 0.12;
  const t = performance.now() / 1000;

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
let speaking = false;
let preferredVoice = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const prefs = ["Google UK English Male","Daniel","Arthur","Microsoft Ryan",
    "Microsoft Guy","Google UK English","Alex","Microsoft David"];
  for (const name of prefs) {
    const v = voices.find((x) => x.name === name);
    if (v) { preferredVoice = v; return; }
  }
  preferredVoice = voices.find((v) => v.lang && v.lang.startsWith("en")) || voices[0] || null;
}
speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();

function speak(text) {
  addLine("jarvis", text);
  if (muted || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (preferredVoice) u.voice = preferredVoice;
  u.rate = 1.0; u.pitch = 0.9; u.volume = 1;
  u.onstart = () => { speaking = true; el.reactor.classList.add("speaking"); el.coreLabel.textContent = "SPEAKING"; targetEnergy = 0.9; };
  u.onend = () => { speaking = false; el.reactor.classList.remove("speaking"); el.coreLabel.textContent = listening ? "LISTENING" : "STANDBY"; targetEnergy = 0.2; };
  u.onboundary = () => { targetEnergy = 0.55 + Math.random() * 0.4; };
  speechSynthesis.speak(u);
}

el.muteBtn.addEventListener("click", () => {
  muted = !muted;
  el.muteBtn.textContent = muted ? "🔈" : "🔊";
  el.muteBtn.classList.toggle("muted", muted);
  if (muted) speechSynthesis.cancel();
});

/* iOS requires a user gesture to unlock audio output. */
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0; speechSynthesis.speak(u);
  } catch (e) {}
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

el.textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && el.textInput.value.trim()) {
    unlockAudio();
    processInput(el.textInput.value.trim());
    el.textInput.value = "";
  }
});

/* ============================================================
   8. AUDIO DEVICE PICKER (Bluetooth-friendly)
   ============================================================ */
let preferredDeviceId = "";

async function populateDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const ins = devs.filter((d) => d.kind === "audioinput" && d.label);
    if (ins.length > 1) {
      const cur = el.micSelect.value;
      el.micSelect.innerHTML = "";
      const def = document.createElement("option");
      def.value = ""; def.textContent = "🎧 System default (incl. Bluetooth)";
      el.micSelect.appendChild(def);
      ins.forEach((d) => {
        const o = document.createElement("option");
        o.value = d.deviceId; o.textContent = d.label;
        el.micSelect.appendChild(o);
      });
      el.micSelect.value = cur;
      el.micSelect.hidden = false;
    }
  } catch (e) {}
}
el.micSelect.addEventListener("change", () => { preferredDeviceId = el.micSelect.value; });
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", populateDevices);
}

function micConstraints() {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (preferredDeviceId) base.deviceId = { exact: preferredDeviceId };
  return { audio: base };
}

/* ============================================================
   9. VOICE INPUT
   Path A: native SpeechRecognition (Android / desktop Chrome)
   Path B: on-device Whisper (iPhone / Safari / anything else)
   ============================================================ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const useNative = !!SR;
let listening = false;

/* ---------- Mic UI helper ---------- */
function setMicUI(state) {
  const txt = el.micBtn.querySelector(".mic-text");
  el.micBtn.classList.toggle("live", state === "recording");
  el.reactor.classList.toggle("listening", state === "recording");
  if (state === "recording") { txt.textContent = "LISTENING"; el.coreLabel.textContent = "LISTENING"; }
  else if (state === "thinking") { txt.textContent = "THINKING"; el.coreLabel.textContent = "THINKING"; }
  else { txt.textContent = "TALK"; el.coreLabel.textContent = speaking ? "SPEAKING" : "STANDBY"; }
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
      speak(`I could not access the microphone, ${USER_NAME}. Please grant permission, or type to me instead.`);
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
    setStatus("Voice model ready, Christian. Tap TALK and speak.");
    return t;
  })();
  return transcriberPromise;
}

/* Raw-PCM recorder (no codecs → robust on iOS Safari) */
let recState = "idle"; // idle | recording | transcribing
let recAC, recSource, recProcessor, recStream, recBuffers, recSampleRate;
let speechDetected, silenceStart, recStart;

async function startRecording() {
  try {
    ensureTranscriber(); // begin loading model in parallel
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
    speak(`I could not access the microphone, ${USER_NAME}. You can also type to me below.`);
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
    setStatus("I didn't catch anything, Christian. Tap TALK and try again.");
    return;
  }

  const audio16k = resampleTo16k(merged, sampleRate);
  setStatus("Thinking…");
  try {
    const t = await ensureTranscriber();
    const out = await t(audio16k);
    const text = (out && out.text ? out.text : "").trim();
    recState = "idle"; setMicUI("idle");
    if (text && !/^\[.*\]$/.test(text)) { processInput(text); setStatus("Tap TALK to speak again, Christian."); }
    else { setStatus("I didn't catch that, Christian. Tap TALK and try again."); }
  } catch (e) {
    recState = "idle"; setMicUI("idle");
    setStatus("Voice model hiccup — you can type your command instead, Christian.");
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

el.micBtn.addEventListener("click", () => {
  unlockAudio();
  if (!activated) {
    activated = true;
    setStatus(useNative
      ? "Jarvis online. Tap TALK and speak, Christian."
      : "Jarvis online. Tap TALK, allow the mic, then speak, Christian.");
    setMicUI("idle");
    speak(`${greetingByTime()}, ${USER_NAME}. J.A.R.V.I.S. is online and ready.`);
    return;
  }
  toggleVoice();
});

/* Desktop convenience: hold SPACE to talk (when not typing). */
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement !== el.textInput) {
    e.preventDefault();
    unlockAudio();
    if (!activated) { el.micBtn.click(); return; }
    toggleVoice();
  }
});

/* ============================================================
   11. BOOT
   ============================================================ */
window.addEventListener("load", () => {
  el.coreLabel.textContent = "STANDBY";
  el.npArtist.textContent = "J.A.R.V.I.S.";
  el.npTrack.textContent = "Systems Online";
  setMicUI("idle");
  el.micBtn.querySelector(".mic-text").textContent = "ACTIVATE";
});
