# FLIGHT 404 cabin audio

Sound is off by default. Enable **Cabin sound** in the flight header to hear engine ambience, chimes and recordings. Captions remain available with sound off. The captions are game instructions, not transcripts of the supplied recordings.

## Installed recordings

| Original file | Inspected media | Use in the game |
| --- | --- | --- |
| `welcome.m4a` | 4.020 seconds; AAC, mono, 44.1 kHz | Welcome after the flight starts. |
| `service chime.mp3` | 3.240 seconds; MP3, stereo, 48 kHz | Attention chime before announcements and the safety demonstration. |
| `seatbelt.mp3` | 13.632 seconds; MP3, stereo, 48 kHz | Seatbelt narration during the first, 14.5-second safety demonstration step. |

These files were supplied by the user from online sources. Original bytes are preserved; public copies are made during preparation. Media decoding and duration were inspected locally. The user confirmed that the clips contain a welcome, a service chime, and instructions for fastening a seatbelt. No verbatim transcription was made. Source URLs and licenses have not been provided or verified. The seatbelt file's embedded artist tag is “Dong Calaycay Fam” and its title begins “Seatbelt Safety Protocol || Safety Flight”; these are metadata, not a verified attribution or license. Add the original source URLs and permission/license details here before publishing these recordings.

`seatbelt` is used only for the demonstration. It is never mapped to turbulence warnings. A separately supplied `turbulence` recording will play when rough weather begins, including training drills. The seatbelt demonstration lasts 14.5 seconds so its 13.632-second narration can finish; no preceding chime delays that recording. The oxygen, life vest and exit demonstrations each last four seconds and use matching animations and game instructions. Starting the card arrangement plays only the attention chime.

Only one recorded narration plays at a time. Stage announcements play the chime before narration; the synchronized seatbelt demonstration and urgent pressure, smoke, and pilot-medical announcements start immediately. A new event replaces the previous cue. Mute, leaving the flight, entering a meeting, ending the round, or hiding the browser tab stops the engine/weather/pressure ambience. Narration also stops on mute, meetings, leaving and hiding the tab. Re-enabling sound during the seatbelt step seeks to the current demonstration time. Returning from a meeting also resumes at that time. An active incident announcement can replay when sound is re-enabled or the tab becomes visible; other announcements replay only within eight seconds of their cue.

Weather sound follows the actual turbulence controller, including practice drills. The supplied weather loop replaces the generated rumble using a gentle gain transition. Pressure has a restrained generated air hiss while the pressure incident is active. Mask deployment has a short generated mechanical click/whoosh until a recording is added; smoke and pilot-medical events use a quiet two-tone warning. These are stylized game sounds, not recordings of actual emergencies. Steady ambience shares one Web Audio context, uses smooth gain changes, and cannot multiply with network updates. Optional missing files are skipped silently. A successful arrival can still play its short arrival announcement after the engine bed stops.

## Adding clips

Supported extensions: `.mp3`, `.m4a`, `.ogg`, `.wav`. Names are matched without case sensitivity; spaces in filenames are URL-encoded. Use one of these base names:

- `welcome`: welcome aboard and prepare for departure.
- `service`: cabin service may begin.
- `seatbelt` or `safety`: a seatbelt fastening explanation no longer than 14 seconds, played with the first physical demonstration (`seatbelt` takes precedence).
- `chime` or `service chime`: short attention tone.
- `turbulence`: fasten seatbelts and secure the cabin.
- `secure`: the aircraft has become stable.
- `approach`: prepare to land and inspect the cabin.
- `emergency`: crew attend to the alert; passengers remain calm.
- `landed`: the flight has arrived safely.
- `pressure-warning`: cabin pressure alert and put on the oxygen mask.
- `smoke-warning`: cabin smoke alert and follow crew instructions.
- `pilot-medical`: request medical assistance in the cockpit, without revealing a suspect.
- `recovery`: calm confirmation that an incident has been resolved (`secure` is accepted as a fallback).

Short recordings of about 3–12 seconds at similar volume work best. Add creator, source and license information beside downloaded clips. `water`, `coffee`, `meal` and `blanket` are accepted for future passenger dialogue but are not played yet. If there is no recording for a cue, the game still shows its instruction and plays the attention chime. If the chime is absent or cannot play, a short generated two-tone chime is used.

Run `npm run assets:voice` after adding clips during development and reload. `npm run dev` and `npm run build` prepare clips automatically. For the production server (`npm start`), run `npm run build` to include them in `dist/`. The script only copies recognized filenames; it does not alter the source recordings or change their gain.


## Next sounds to add

Put these in the root `/voice` folder. The extension below is a suggestion; all four supported formats work. Sound is still playable now with quiet generated substitutes. Use clips without music, trim long silence, and choose recordings with permission for game use.

| Priority | Filename | What to supply | Playback |
| --- | --- | --- | --- |
| 1 | `turbulence-loop.ogg` | Low cabin rumble and gentle panel rattles, without speech or alarm tones. Make the start/end join smoothly. | 8–20 seconds, seamless loop while rough weather is active; fades as control improves. |
| 1 | `oxygen-mask-drop.wav` | Overhead compartment latch opening, masks dropping, light plastic rustle. | 1–3 seconds, once when masks deploy; capped at 8 seconds. |
| 1 | `turbulence.mp3` | A calm announcement asking passengers to fasten seatbelts and crew to secure the cabin. | 4–10 seconds, once at weather onset, after the attention chime. |
| 1 | `pressure-warning.mp3` | A clear cabin announcement to put on the oxygen mask and follow crew instructions. | 4–10 seconds, immediately when cabin pressure drops. |
| 2 | `cabin-warning.wav` | A restrained two-tone caution chime, without speech. | 1–3 seconds, once for a smoke or pilot-medical alert; capped at 8 seconds. |
| 2 | `smoke-warning.mp3` | Calm request to stay clear of the affected area and follow crew instructions. | 4–10 seconds, immediately at the smoke alert. |
| 2 | `pilot-medical.mp3` | Crew request for medical assistance in the cockpit. | 3–8 seconds, immediately when the pilot needs aid. |
| 2 | `recovery.mp3` | Calm all-clear and request for crew to check on passengers. | 3–8 seconds, after pressure/smoke repair or pilot aid. |
| 3 | `seatbelt-chime.wav` | Brief seatbelt-sign tone, without an announcement. | 0.5–2 seconds, once for a seatbelt-sign transition not already covered by an announcement. |

The existing `welcome.m4a`, `service chime.mp3`, and `seatbelt.mp3` are already connected; no replacements are needed. Optional additions are discovered during the next `npm run assets:voice` / build. No extra sound download or paid asset service is required.
