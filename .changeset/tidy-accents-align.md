---
'@kajidog/voicevox-client': patch
'@kajidog/mcp-tts-voicevox': patch
---

Fix `phrases` (inline accent notation) rejecting valid input with "Bracket position N does not align with any mora boundary".

VOICEVOX runs its own morphological analysis on the katakana text, so the accent phrases it returns do not always line up with the phrase separators (`,`) in the notation — `アクセントシ` comes back split as `アクセント` + `シ`, for instance. Accent phrases were matched to notation phrases by index, so the bracket position was looked up inside the wrong accent phrase and a correct notation could fail depending on the words used.

Accent phrases are now regrouped to follow the notation's phrase boundaries before the accent is applied: a notation phrase spanning several accent phrases is merged into one, and an accent phrase spanning several notation phrases is split. If the notation cannot be matched against the moras (non-katakana text, for example), the previous index-based behaviour is used as a fallback.

Omitting the brackets now restores VOICEVOX's own accent phrase segmentation as well as its accent values, so an accent set with brackets can be reset afterwards. Flat accents (`accent: 0`) are also kept as-is when a phrase is split.
