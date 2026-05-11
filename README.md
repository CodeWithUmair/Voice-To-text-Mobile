# Voice to Text — Android (React Native / Expo)

Mobile version of the voice-to-text desktop app. Tap mic → speak → get text → edit → copy.

**Stack:** Expo (React Native) · OpenAI `gpt-4o-mini-transcribe` · `expo-av` · `expo-secure-store`

**Cost:** ~$0.003/minute of audio (≈ half of `whisper-1`).

---

## What's different from the Electron version

- Built for Android (tested target: Google Pixel 7).
- Output is a real **editable** text box — you can fix transcription mistakes before copying.
- Uses `gpt-4o-mini-transcribe` instead of `whisper-1` (~50% cheaper).
- Auto-copies to clipboard after each successful transcription.

---

## One-time setup (on your PC)

You need Node.js (18+) and a free Expo account. **You do NOT need Android Studio** — EAS Build runs in the cloud and gives you an APK.

```powershell
# 1. Install deps
cd e:\Applications\voice-to-text-mobile
npm install

# 2. Install the EAS CLI globally (one time, on any project)
npm install -g eas-cli

# 3. Make a free Expo account at https://expo.dev, then log in
eas login
```

---

## Build the APK (cloud build via EAS)

```powershell
npm run build:apk
```

This kicks off a cloud build on Expo's servers. Takes ~10–15 min the first time. When done, EAS shows a download URL — open it on your **Pixel 7's browser** and tap the APK to install it (you'll need to allow "Install unknown apps" for Chrome the first time).

> The first build will ask you to "generate a new Android Keystore" — say **yes**. EAS stores it for you. All future builds reuse the same keystore so updates install over the old version.

---

## Quick dev loop (no build needed)

If you just want to try changes fast without rebuilding APKs:

1. Install **Expo Go** on your Pixel 7 from the Play Store.
2. On your PC:
   ```powershell
   npm start
   ```
3. Scan the QR code shown in the terminal using Expo Go on your phone.
4. Edit `App.js` — the app reloads instantly.

> Expo Go is great for iterating, but `expo-secure-store` and recording behave best in the actual APK build. For day-to-day use, install the APK.

---

## Using the app

1. Open the app on your phone.
2. Tap the **gear icon** (top right). Paste your OpenAI API key (`sk-...`). Tap **Save**.
3. Tap the big **Record** button. Speak. Tap **Stop**.
4. Text appears in the editable box. **Tap into it to edit** — fix anything before sharing.
5. Tap **Copy** to put the (possibly edited) text on your clipboard. Paste anywhere — WhatsApp, Gmail, browser, etc.
6. Pick a language chip (EN/UR/HI/AR) for slightly better accuracy on non-English speech.

**Get an API key:** https://platform.openai.com/api-keys

---

## File layout

```
voice-to-text-mobile/
├── App.js              # All UI + recording + transcription logic
├── app.json            # Expo config (Android permissions, package name)
├── package.json        # Dependencies
├── eas.json            # EAS Build profiles (preview = APK, production = AAB)
├── index.js            # Entry point
├── babel.config.js
└── README.md
```

---

## Troubleshooting

**"Mic blocked"** — Android Settings → Apps → Voice to Text → Permissions → enable Microphone.

**"API 401" or "Invalid API key"** — Open settings (gear icon) and paste the key again. Make sure it starts with `sk-`.

**`expo-av` deprecation warning** — `expo-av` still works in SDK 54 but is being replaced by `expo-audio`. If you want to migrate later, swap the import and use `useAudioRecorder` hook. Not urgent.

**EAS Build fails on first run** — Run `npx expo install --fix` to align package versions with the installed SDK, then try `npm run build:apk` again.

**Want to update the app on your phone** — Run `npm run build:apk` again. Install the new APK over the old one (same keystore = no uninstall needed).

---

## Pricing reference

- `gpt-4o-mini-transcribe` — $0.003 per minute of audio
- `whisper-1` — $0.006 per minute (the Electron version uses this; mobile uses the mini)
- 100 minutes of dictation ≈ $0.30
