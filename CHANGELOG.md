# Changelog

All notable changes documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

### Added

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
