# Credits

Burn Rate is made by Kelbo / Longlight Interactive. Everything not listed here
is original work for this game (code, the icon, the stylesheet).

## Fonts (`fonts/`)

All three are under the SIL Open Font License 1.1; the licence texts are beside
the files. Taken from the `@fontsource` npm packages (5.3.0), latin subsets only
(plus Martian Mono's Cyrillic for the range stencils).

| Font | Authors | Licence | Source |
| --- | --- | --- | --- |
| Saira Semi Condensed (400, 600, 700) | The Saira Project Authors (Omnibus-Type) | OFL 1.1 (`fonts/OFL-saira.txt`) | https://github.com/Omnibus-Type/Saira |
| Saira Stencil One (400) | The Saira Stencil Project Authors (Omnibus-Type) | OFL 1.1 (`fonts/OFL-saira-stencil.txt`) | https://github.com/Omnibus-Type/Saira |
| Martian Mono (400, 600) | The Martian Mono Project Authors (Evil Martians) | OFL 1.1 (`fonts/OFL-martian-mono.txt`) | https://github.com/evilmartians/mono |

## Studio pieces (`assets/studio/`)

The Longlight Interactive logo files are copied unchanged from the studio
site's press kit (`Jxstrr0/Kelbo.Website` `assets/press/`), © Kelbo /
Longlight Interactive.

## three.js (`lib/three.min.js`)

The 3D stand uses three.js r187 (https://threejs.org), MIT licence, © 2010-2026
three.js authors; the licence text is `lib/LICENSE-three.txt`. The file is a
cut-down build made by `tools/vendor-three.sh` from the official npm package.

## The range model (`models/range.glb`)

Original work for this game: Stand 3, the blockhouse, the launch rail and the
range buildings are built by a script (`tools/blender-range.py`, run headless in
Blender's `bpy`), with no outside models or textures.

## Sound

Every sound effect is made while the game runs (`src/sound/synth.js`, WebAudio):
the motor's roar, the crackle, the countdown beeps and the relay. There are no
recorded effects.

## Ruslan's voice (`sounds/voice/`)

**AI-generated.** Ruslan Abenov's range calls and report sign-offs, in English
(`sounds/voice/en/`) and Russian (`sounds/voice/ru/`), were generated with
ElevenLabs text-to-speech (the Multilingual v2 model, the stock voice
"Wladimir") from the script in `tools/voice-lines.json`, written for this game.
The clips were then trimmed, levelled and re-encoded (ffmpeg).
Ruslan is a fictional character; the voice is not a recording of a real person
speaking these lines.

## Code shared with other Longlight Interactive games

A few small pieces are adapted from Kelbo's own games, each marked with an
`Adapted from` line at the top of its file: the save codes and the offline
service worker (Scrapline), the bottom sheet, the sim test runner and the icon
renderer (Escapement), and the seeded random numbers (The Whip).

## Algorithms and references

- Seeded random numbers: sfc32 (Chris Doty-Humphrey, PractRand) seeded by
  cyrb128 (bryc), both public domain.
- Calendar days for the Daily Spec: Howard Hinnant's `days_from_civil`
  algorithm ("chrono-Compatible Low-Level Date Algorithms").
- The internal ballistics are the textbook quasi-steady model (G. P. Sutton
  and O. Biblarz, *Rocket Propulsion Elements*); nozzle flow separation uses
  the Summerfield criterion.

## Store art

The cover on the studio site is a frame captured from the game's own 3D stand
(an N-class motor seen from the nozzle close-up camera), not generated art.
