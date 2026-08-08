# J.A.R.V.I.S. Screen — for Christian

An Iron-Man-style HUD dashboard you can **talk to** and that **talks back**,
addressing you as **Christian**. Built with plain HTML/CSS/JS — no build step,
no dependencies.

![preview](preview.png)

## Features

- **Animated arc-reactor** center HUD with rotating rings and an audio-reactive
  bar visualizer that lights up while you speak.
- **Live clock, day and date** (top-left) in the movie style.
- **Live weather** for your location via [Open-Meteo](https://open-meteo.com)
  (free, no API key). Falls back to New York if location is denied.
- **Voice conversation**:
  - Listens with the browser's SpeechRecognition.
  - Replies out loud with SpeechSynthesis, always calling you **Christian**.
- **Now Playing**, **system stats**, and a scrolling **transcript** console.

## How to run

Because it uses the microphone and geolocation, browsers require a secure
context. Any of these work:

**Option A — just open it**

Open `index.html` in **Google Chrome or Microsoft Edge** (Web Speech API is
best supported there). Microphone works on `file://` in Chrome; if not, use
Option B.

**Option B — local server (recommended)**

```bash
# from this folder
python3 -m http.server 8000
# then visit http://localhost:8000
```

Then **allow microphone** (and optionally location) when prompted.

## How to talk to it

- Click **TALK** (or **hold the space bar**) and speak.
- Or type a command in the box and press Enter.
- Toggle Jarvis's voice with the **🔊** button.

### Things to say

| Say… | Jarvis does… |
|---|---|
| "Hello" / "Hey Jarvis" | Greets you, Christian |
| "What time is it?" | Speaks the time |
| "What's the date?" | Speaks today's date |
| "What's the weather?" | Reports current conditions |
| "Who are you?" | Introduces itself |
| "Open YouTube / Google / GitHub / Gmail" | Opens the site |
| "Search for &lt;anything&gt;" | Web search |
| "Tell me a joke" | Tells a joke |
| "What can you do?" | Lists abilities |
| "Goodbye" | Signs off |

## iPhone / iPad (Safari)

Apple's Safari does **not** support the browser's built-in speech recognition,
so Jarvis uses **on-device speech recognition (OpenAI Whisper, running locally
via [transformers.js](https://github.com/xenova/transformers.js))** instead.
Everything stays on your phone — no servers, no API keys.

How it works on iPhone:

1. Open the site (over **https** — GitHub Pages is fine) in Safari.
2. Tap **ACTIVATE** once — Jarvis powers on and greets you (this unlocks audio,
   which iOS requires on first tap).
3. Tap **TALK**, allow the microphone, and speak. Tap again (or just pause) to
   finish; Jarvis transcribes on-device and replies out loud, "Christian".

> The **first** time you use voice on iPhone, a small (~40 MB) voice model
> downloads once and is then cached. Give it a few seconds. After that it's fast.

## The J.A.R.V.I.S. voice 🎩

Jarvis speaks with a calm, refined **British male** voice to match the films —
on iPhone that's Apple's **Daniel** (en-GB), delivered slightly slower and
lower-pitched for the dry-butler feel.

**Make it sound much better (iPhone, one time):** download the high-quality
version of the voice —

> **Settings → Accessibility → Spoken Content → Voices → English (UK) → Daniel**
> → tap **Enhanced** (or **Premium**) to download it.

Jarvis picks that up automatically the next time it speaks. The difference is
significant: the default voice is noticeably more robotic.

> Note: this is the closest match available from built-in browser speech. The
> actual film voice (Paul Bettany) isn't something any browser ships, and
> cloning a real actor's voice isn't something this project does.

### Cinematic voice via ElevenLabs (optional)

For a dramatically better voice, Jarvis can speak through
[ElevenLabs](https://elevenlabs.io). It picks a British male voice from your
account (George → Daniel → Brian → Charlie) and, while it talks, the reactor
pulses to the **real audio waveform** rather than a simulated rhythm.

**Setup — takes a minute:**

1. Make a free ElevenLabs account and copy your API key from
   **Profile → API Keys**.
2. On the Jarvis page, **press and hold the circle for one second**.
3. Paste the key and press OK. Jarvis confirms in the new voice.

To remove it, long-press again, clear the box, press OK.

> **Where the key lives:** only in this browser's `localStorage`, on your
> device. It is never committed to this repository and is sent nowhere except
> ElevenLabs.
>
> **Never hard-code the key into these files** — this site is public, so a key
> in the source would be visible to anyone and could be used to drain your
> quota. Anyone with access to your unlocked device/browser profile can read
> a stored key, so treat it like a password and rotate it if in doubt.

If the key is rejected, the quota runs out, or the network fails, Jarvis
automatically falls back to the built-in voice and tells you why.

## Bluetooth speakers & microphones 🎧

Jarvis uses your device's **system audio route**, so when you connect Bluetooth
audio it "just works":

- **Output** (Jarvis talking) follows your selected Bluetooth speaker/headphones.
- **Input** (you talking) uses the system default mic — which becomes your
  Bluetooth headset's mic when connected as a call/HFP device.
- If more than one microphone is available, a **microphone picker** appears under
  the controls so you can force a specific input (e.g. your AirPods).

Tip: for the mic to route to Bluetooth on iPhone, the device must be a headset
(with a mic), not an output-only speaker — that's an iOS routing rule, not a
limitation of Jarvis.

## Browser support summary

| Platform | Voice input | Voice output |
|---|---|---|
| iPhone / iPad (Safari) | ✅ on-device Whisper | ✅ |
| Android (Chrome) | ✅ native, instant | ✅ |
| Desktop Chrome / Edge | ✅ native, instant | ✅ |
| Other browsers | ✅ Whisper fallback | ✅ where supported |

In every case the **text box** works as a reliable fallback, and Jarvis speaks
its replies wherever SpeechSynthesis is available.

## Files

- `index.html` — layout
- `style.css` — the HUD look
- `script.js` — clock, weather, visualizer, and the voice brain
