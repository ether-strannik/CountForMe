<p align="center">
  <img src="logo.png" alt="Count for me" width="160" />
</p>

<h1 align="center">Count for me</h1>

<p align="center">
  An opinionated interval timer built for workouts that do not fit neatly into standard work, rest, and round patterns.
</p>

## What it does

- **Timers that announce and stop.** A single cue when the timer reaches zero, like a sports watch, with no alarm to dismiss.
- **Two interval modes that fit how you think.** Build workouts from work, rest, cycles, and sets, or define a block, cycle, and work duration and let the timer calculate the rest and cycle count.
- **Variable cadence timer.** Split a block into ranges and give each range its own rate. Repeat the complete pattern across rounds.
- **Themes that carry their sounds.** A theme is the colours, the sound of every cue, and the spoken counts, in one folder. The app ships with one; make your own from blank or from a copy, edit it in place, and see it live.
- **Presets in categories.** Save a complete setup by name, group presets into categories, and pick one back up from the top of the screen. A category can name a theme, and picking a preset from it puts that theme on.
- **Presets and themes that travel.** Export what a tab holds to a file, or a theme as a zip, and hand it to someone else. Import either from anywhere on the phone.

## What it can become for you

Nothing above is new in kind. It is deeper. A theme is not colours any more but colours and sounds. A preset is not alone but in a category, and a category can carry a theme. Both travel.

Put those together and you are not saving a workout. You are saving a story line.

A set of workouts with its own palette, its own gong, its own voice counting the reps, and names that mean something to you, is an identity. Someone who opens it does not open five squats, five push-ups, five pull-ups, five rounds. They open a room you made, and the workout is what happens in it. A program can walk them through levels of it, each with its own look and sound.

This is a tool for creators and for a community. It is made for sharing your programs and what stands behind them: the part of you that does not usually travel with a program. Your mood, your thinking, the zone you are in. Sounds, colours, themed categories, the names of the workouts and the workouts themselves all say it, and they say it together.

You are the creator, and you decide what this app is. Another interval timer, or far more than that. It is in your hands.

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

### Working on the page

There is a third build, `:app:assembleDev`, for editing. It loads the
page from a server on `http://127.0.0.1:5173` instead of from its own
assets, so a change to the HTML, CSS or JavaScript shows in the running
app with no rebuild. Java changes still need one.

It installs as `com.al.countforme.dev`, beside the real app rather than
over it, so there is no build to switch back from and no way to ship one
pointing at a server. Everything it needs is under `android/app/src/dev/`
— the address, the permission to reach it, and a name that says which
app you are looking at. Serve `web/` at that address with any static
server that reloads on change.

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
