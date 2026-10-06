# Desktop 0.181.0 blog image studio

## Scope
- Blog cover image generation through a separate local paid Gemini image key.
- Fixed gemini-3.1-flash-image, 1K square, one image per request, 2048 output-token limit, 90-second timeout, no automatic retries.
- Local Windows-account encrypted settings and persisted monthly reservation ledger. USD 2 / 10 attempts per KST month; reserve USD 0.20 before each request, including unsuccessful attempts. Changing keys does not reset usage.
- This is an application attempt limit, not a Google billing-account spending cap. Other apps, PCs, or deletion of local state are outside it.
- Generation disabled until the user enters a separate paid-project key and explicitly enables it. Existing free text-generation credentials are unchanged.
- Local photo import, headline overlay, blog preview cover, and native PNG save. Images are not included in saved draft JSON. Naver image attachment remains manual.

## Verification
- 159 packaged source files matched source in distribution-20260921-205712-706.
- Packaged Electron fixture verified generation response rendering, one request, preview application, real IPC PNG export/signature, 1440/1040/760px layouts, and logout cleanup. Google response mocked; no paid request executed.
- Service tests cover explicit setup, ten-attempt limit, duplicate/concurrent rejection, failure reservation, persistence failure, fixed provider request, and malformed response.
- Existing desktop adapter test fixture lacked tracking.status=SUCCESS and was corrected to satisfy the established server contract; production shipping behavior unchanged.

## Remaining live setup
The user must enter a dedicated paid image key in Blog > Image Studio. Paid Google generation has not been live verified; saved settings alone do not confirm key permission or billing availability.

Final desktop regression: 475 tests passed, 0 failed.
