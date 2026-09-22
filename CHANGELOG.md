# Changelog

All notable changes documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

### Changed

- The app ships one theme, Nord, and looks like it from the first
  frame. Default, Gruvbox and Light are no longer in the app; they
  return as complete sets to load from the chosen folder.

## [1.1.3] - 2026-09-22

### Changed

- A countdown timer sounds with the app in the background or the
  screen off, as a session does. It used to end in silence unless the
  app was on screen, and a timer left running when the app closed
  came back mute.
- The reset button on a running timer is a drawn mark. A timer card
  now carries no text glyphs at all, so nothing on it depends on the
  device's font.

### Added

- Countdown timers knock through their last seconds, the way Phases
  and Cadence do. The count and the sound come from Last seconds
  under Sounds, so all three tabs share one setting and zero still
  turns it off.

### Fixed

- The spoken count says seven. The file shipped for it was silent, so
  a range set to 7 reps showed the number and said nothing.
- A run with a quiet minute in it no longer stops counting when the
  app is off screen. Android stops the sound output of a hidden app
  after sixty silent seconds, and the clock every cue sits on stopped
  with it. The app now stays audible to the system for as long as
  something is running, at a level no one can hear.
- A countdown timer shows the second it is in. A 5:00 timer holds
  5:00 for its first second, where it used to drop to 4:59 almost at
  once.

## [1.1.2] - 2026-09-22

### Added

- A Timer row under Sounds, setting what a new countdown timer starts
  with. Timers already made keep their own sound.
- A Volume tab in settings, with a fader for the cues and one for the
  spoken counts. Zero is the level the app ships at, and each has a
  Test button so a level can be heard while it is set. A fader moved
  during a session takes effect at once.

### Changed

- The settings gear, and the edit and delete buttons on a timer card,
  are drawn marks rather than text characters, so they look the same
  on every device. Delete now sits in the same bordered button as
  edit.
- The Cadence setup line counts cycles and rounds, the same two the
  run screen shows. Reps join it only while rep counting is on.

### Fixed

- Phases time based mode keeps the last cycle of a block instead of
  dropping it. A 10:00 block at a 45 second cycle now runs 14 cycles
  over 10:30, where it used to run 13 over 9:45. The line under the
  setup has always shown the real length.
- Cadence no longer runs a range that is not a whole number of its
  cadence. A range of 5:00 at a cue every 45 seconds has no honest
  answer, and the app used to drop a cue silently, leaving a 75
  second gap and putting every later range out of step. It now names
  the range and the two ends that would fit, and START waits.
- The spoken rep counts were quieter than the cue sounds. They now
  play loud enough to sit with them.

## [1.1.1] - 2026-09-22

### Added

- The preset manager lists categories, and the presets inside them,
  by name. A view order only: nothing in the library moves.

### Changed

- The Cadence run screen counts cycles in the round, like Phases,
  instead of reps. Thirty work intervals a round now read 1/30 to
  30/30.

### Fixed

- A Cadence file edited by hand with a bad number in it, such as no
  rounds or a cadence that is not a number, now loads the way the
  setup would have set it. Before, it ran an empty session or one with
  cues past the end.
- Sound and screen drifted apart by seconds a minute on programs with
  long gaps between cues. Android closed the audio stream during the
  silence and its clock fell behind. The run now keeps the stream open
  for its length and draws from the audio clock, so what is heard and
  what is seen come from one clock.

## [1.1.0] - 2026-09-21

### Added

- Share an export instead of saving it, through the usual Android
  share sheet. Sharing needs no folder; only saving does.
- Export and import live in the preset manager. Export ticks whatever
  should go in the file, categories included, and a category travels
  whole with its presets inside. Import adds and never overwrites: a
  name already taken arrives as "name (2)".
- Delete several presets and categories at once from the selection
  menu. The confirm counts the presets inside a chosen category, so
  nothing goes without being named first.
- Naming a new preset asks whether to add it to a category, and puts
  it there the first time you save.
- Categories fold shut, and start that way, so a long library opens as
  one screen of names with a count beside each.
- Presets sit nested under the category holding them. Presets in no
  category stay at the root, below the categories.
- Long-press a preset or a category to select several at once, then
  move the selected presets into a category.
- Categories, made with + Category in the preset manager. Deleting one
  deletes the presets inside it, and says how many first.
- A preset manager, opened by tapping the preset name. Picking, naming
  and deleting all happen there instead of on the tab.

### Changed

- Cadence no longer keeps what is on screen between launches. Both
  tabs now load the preset they were last on, and Save is the only
  thing that writes.
- Each tab shows one preset row: the name, and Save. Save always
  writes the setup on screen to the named preset.
- Naming a new preset opens a blank setup instead of copying the one
  on screen, and stores nothing until you press Save.

## [1.0.0] - 2026-09-20

First release.

- **Timers that announce and stop.** One cue at zero, like a sports
  watch. No alarm to dismiss.
- **Phases**, the interval tab, in two modes. Standard takes work, rest
  and a cycle count. Time takes a block and a cycle length and works
  out the rest.
- **Cadence**, the block-first tab. Split a block into ranges and give
  each range its own rate, then repeat the whole pattern for as many
  rounds as you want.
- **A rep count per range**, on a switch. The number fills the screen
  for three seconds at each cue, then the counter comes back.
- **Voice**, on a second switch. The number is spoken as well as shown.
- **A sound for each cue** — prepare, work, halfway, last seconds, rest
  and finish. Sixteen ship with the app; your own go in a folder you
  choose once and appear in the same lists.
- **Keep screen on**, in settings, for as long as the app is in front.
- **Presets** per tab, saved by name and picked from the top of the
  screen.
- **Presets that travel.** Export what a tab holds to a file and hand
  it to someone else.
- **Themes**, picked in settings. Default, Nord, Gruvbox and Light ship
  with the app.
- **Sessions keep running** when you leave the app or the screen goes
  off. An ongoing notification counts down and taps back into the app.
