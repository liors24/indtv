# Flixgram — Telegram media on Android TV

Your Telegram channels, groups and chats as a TV library: series are grouped by season and episode,
videos stream straight from Telegram (nothing is kept on the TV after watching), D-pad first, Hebrew RTL.

**Install on the TV:** in the *Downloader* app enter

    https://github.com/liors24/indtv/releases/download/flixgram/Flixgram.apk

The link never changes; every push to `flixgram/` rebuilds the APK and replaces the file
(`.github/workflows/build-flixgram.yml`). Updates install over the previous version (same signing key in `keys/`).

**First launch:** scan the QR with your phone and paste `api_id` / `api_hash` from https://my.telegram.org/apps,
then log in by scanning the second QR from Telegram → Settings → Devices → Link Desktop Device.

## How it works
* `src/` — tiny native host: fullscreen WebView UI, TDLib (JSON API) through a JNI shim (`jni/shim.c`),
  a local HTTP server that streams a Telegram file with byte ranges while TDLib downloads only the needed parts,
  and Android's MediaPlayer on a SurfaceView behind the transparent UI.
* `web-src/` — the TV interface (vanilla JS, spatial navigation, bundled with esbuild).
* TDLib 1.8.36 prebuilt Android libraries come from `itxmoizdev/handy-tdlib-next` (pinned commit + sha256).
* Browser preview with fake data: `node tools/webbuild.mjs dev && node tools/devserver.mjs` → http://127.0.0.1:8777
