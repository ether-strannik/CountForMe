<p align="center">
  <img src="logo.png" alt="Count for me" width="160" />
</p>

<h1 align="center">Count for me</h1>

<p align="center">
  An opinionated interval timer built for workouts that do not fit neatly into standard work, rest, and round patterns.
</p>

- **Purpose:** A workout timer.
- **What it is not:** It is NOT a revolutionary new category of temporal athletic performance software.
- **Why it exists:** The timers I tried did not support a few programming patterns I needed.
- **Who it is for:** Workout enthusiasts and athletes who need more flexibility than a basic interval timer provides.
- **Technology:** HTML, CSS, JavaScript, ES modules, Node.js, Capacitor, Android.
- **Philosophy:** No accounts. No social layer. No gamification. No coaching. No bullshit.
- **Success criterion:** It works reliably and gets out of the way.

## What it does

* **Timers that announce and stop.** A single cue when the timer reaches zero, like a sports watch, with no alarm to dismiss.
* **Two interval modes that fit how you think.** Build workouts from work, rest, cycles, and sets, or define a block, cycle, and work duration and let the timer calculate the rest and cycle count.
* **Variable cadence timer.** Split a block into ranges and give each range its own rate. Repeat the complete pattern across rounds.
* **Themable interface.** Style the timer to your liking with customizable themes.
* **Presets.** Save a complete setup by name and pick it back up from the top of the screen.
* **Presets that travel.** Export what a tab holds to a file and hand it to someone else.
* **Your own sound for each cue.** Assign your own audio files to work starts, turnarounds, countdowns, rest, and finish cues.

## Building

Needs Node, a JDK 21 and an Android SDK with platform 36.

```sh
npm ci
npx cap sync android
cd android && ./gradlew :app:assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

The page itself is plain HTML, CSS and ES modules under `web/`, loaded
by the browser as written. Nothing is transpiled or bundled, so what
runs is what is in the repository.

## Attribution

**Sounds.** Sound effects from [Pixabay](https://pixabay.com), used
under the [Pixabay Content
License](https://pixabay.com/service/license-summary/). Attribution
not required.

**Icons.** The interface icons are from [Tabler
Icons](https://tabler.io/icons) by Paweł Kuna, MIT licensed. The full
notice is in `licenses/tabler-icons.txt`.

## Licence

GPL-3.0-or-later. See `LICENSE`.