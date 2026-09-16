# P4-201 - Image briefing cards

Server 1.80.0; desktop 0.162.0.

Scheduled and test WORK/SOLO briefings now render a Korean PNG and send it as one Telegram photo message with a short caption and the existing draft, snooze, and Moaon buttons. The original briefing remains stored for callback actions. Advertising reports use the same renderer and a report confirmation link. Existing schedules, recipients and notification counts are unchanged; change notices and historic reminders remain text.

The renderer uses a bundled static Korean font and deterministic source text, with no image-generation model or external font download. Channel boundaries, missing values, source timestamps and financial caveats are preserved. Font derivation and license are under lib/assistant/assets. Images are rendered in memory and uploaded as multipart content, without publishing business images at public URLs.

Worker rendering authenticates its existing read key before producing an image. Rendering failure falls back before a Telegram request; uncertain photo delivery never triggers a second text message. Claim, binding and at-most-once state transitions remain unchanged. Desktop image preview is explicitly sample data; the image is an exact allowlisted local asset.

Verification:
- 496 Node tests passed, including bounded Korean PNG output, unknown/zero preservation, callback markup, multipart upload, pre-send fallback, ambiguous send without retry, worker authorization and advertising image delivery.
- 11 Python worker tests passed, including one-message multipart behavior, action binding and text fallback.
- Source and packaged Electron checks passed at 700/1060/1660 in light/dark; preview image decoded at 1080px.
- Production header 1.80.0 and authenticated worker PNG generation (1080x640) verified.
- Hermes automation installed; timer active and last service result success/0. Root and WORK/SOLO profile automation copies have equal hashes (normalized source matches).
- Existing WORK 09:00 enabled/revision 1 and SOLO 09:00 disabled/revision 0 preserved.
- Signed stable desktop 0.162.0 published and installed on the right display. Saved login expired; actual signed-in UI and real Telegram photo test are pending user login. No live test photo has been sent in this phase.

Telegram reference: https://core.telegram.org/bots/api#sendphoto
