# Themes

A theme is everything the app looks and sounds like: its colours, the
sound of every cue, the sound a timer plays, and the spoken counts.
One unit. A theme is whole or it cannot be used, and nothing in it is
overridden from anywhere else. To sound different, use a different
theme, or make your own from a copy.

The app ships one theme, Nord. Others live in this repository under
`themes/`, each a full set, and load from the folder chosen in
Settings.

## The folder

A theme is a folder: a library of sounds, and `theme.json`, which is
a preset over it. The JSON says which colour goes where and which
file from the library plays for each cue and each count. A countdown
timer may ring with any file in the library, not only the ones the
cues use.

```
nord/
  theme.json
  piano-3.mp3      approach
  clock-ticking.mp3
  gong.mp3
  bell-4.mp3
  wine-glass.mp3
  flute.mp3        end, and the timer
  bell-1.mp3 …     the rest of the library: a timer may pick any
  1.mp3 … 9.mp3    the spoken counts
```

Two keys may name the same file. The library is every audio file in
the folder; one dropped in is offered to timers without touching the
JSON. The shipped theme's folder cannot be listed, so its `theme.json`
names the library under `library`. A folder theme may carry that key
too, but its folder is what counts.

## theme.json

```json
{
  "name": "Nord",
  "ui": {
    "bg": "#2e3440",
    "card": "#3b4252",
    "line": "#4c566a",
    "text": "#eceff4",
    "muted": "#9aa7bd",
    "accent": "#88c0d0",
    "warn": "#ebcb8b",
    "bad": "#bf616a",
    "go": "#a3be8c",
    "on-accent": "#2e3440",
    "accent-soft": "#88c0d059",
    "action": "#e5e9f0",
    "on-action": "#2e3440",
    "scrim": "#0000008c",
    "glyph": "#4c566a"
  },
  "library": [
    "bell-1.mp3",
    "bell-2.mp3",
    "bell-3.mp3",
    "bell-4.mp3",
    "bell-5.mp3",
    "bowl.mp3",
    "..."
  ],
  "sounds": {
    "approach": "piano-3.mp3",
    "prepare": "clock-ticking.mp3",
    "main": "gong.mp3",
    "turn": "bell-4.mp3",
    "rest": "wine-glass.mp3",
    "end": "flute.mp3",
    "timer": "flute.mp3"
  },
  "counts": {
    "1": "1.mp3",
    "2": "2.mp3",
    "3": "3.mp3",
    "4": "4.mp3",
    "5": "5.mp3",
    "6": "6.mp3",
    "7": "7.mp3",
    "8": "8.mp3",
    "9": "9.mp3"
  }
}
```

- `name`: what the picker shows.
- `ui`: all 15 colour tokens, hex only: `#rgb`, `#rgba`, `#rrggbb` or
  `#rrggbbaa`. The two translucent ones, `accent-soft` and `scrim`,
  carry their alpha in the last two digits. The names match the custom
  properties in `web/base.css`.
- `library`: every audio file in the folder. Needed in the shipped
  theme, whose folder cannot be listed; a folder theme is listed.
- `sounds`: a file for each of the six cues and for `timer`, what a
  new countdown timer starts with.
- `counts`: a file for each number one to nine.

Every key is required. Every named file must exist beside the JSON.

## The gate

`web/src/themepack.js` holds the rule, once. `themeCheck(manifest,
files)` takes the parsed JSON and the names of the files in the
folder, and answers `{ok, whole, missing, silent}`. `missing` names
every gap:

```
name
colour accent
sound main
file gong.mp3 for sound main
count 7
```

Two lines are drawn, because a theme is built step by step and seen
live as it goes.

- `ok`: the name and every colour are there. The theme can be picked
  and put on. A colour missing would leave a screen nobody can work
  in, so this line is hard. A sound or count still blank is silence
  for that cue, and `silent` lists which; the picker shows them.
- `whole`: everything is there. Only a whole theme is exported or
  imported, so what is handed on is the complete thing.

The app runs the check wherever a theme comes in: listing the folder,
picking, at launch, importing, exporting. A theme that is not `ok` is
listed greyed with its gaps and cannot be picked. Nothing falls back
to anything outside the theme.

## A theme as a zip

A theme folder zipped is the package: `theme.json` and the files
beside it, flat. Export, under Themes, zips the theme in use to a
place the user picks through the system's save dialog, as
`<name>.zip`. Import picks a zip from anywhere on the phone, looks
inside, checks the theme, and only then unpacks it into a new folder
under the user's own and puts it on. Whole themes only, both ways; a
refusal names what is missing.

The zip is made and read on the native side with Android's own zip,
nothing added; no bytes pass through the page. A zip made by hand on
a computer works too: zip the folder. A single top folder inside the
zip is stripped; entries with a path of their own are skipped; an
entry over 20 MB or a zip over 64 MB is refused.

## Where themes live on the phone

Under the folder chosen in Settings, in `themes/`, one folder per
theme. Copy a set from this repository's `themes/` in there and it
appears in the picker.

## Making sounds

The spoken counts in the shipped theme were rendered as described in
`spoken-counts.md`. A theme of your own can use any recording.
