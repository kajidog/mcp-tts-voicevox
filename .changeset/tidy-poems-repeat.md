---
"@kajidog/mcp-tts-voicevox": patch
"@kajidog/voicevox-client": patch
---

Fix the `exports` map so the `types` condition comes first, as TypeScript
requires — resolution previously fell back to the top-level `types` field.

The HTTP server's API key check now compares in constant time instead of with
`!==`, which leaked key material through response timing. The published server
bundle also targets Node 20, matching its `engines` field.
