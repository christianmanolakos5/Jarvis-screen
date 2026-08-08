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

## Browser support

Voice input needs the **Web Speech API** — Chrome and Edge recommended.
If your browser lacks it, the text box still works and Jarvis still speaks
(where SpeechSynthesis is available).

## Files

- `index.html` — layout
- `style.css` — the HUD look
- `script.js` — clock, weather, visualizer, and the voice brain
