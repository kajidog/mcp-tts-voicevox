/**
 * Helpers for referencing OTHER tools from a tool's description, output text, or
 * error messages WITHOUT pointing users at a tool that is currently disabled.
 *
 * When tools are turned off via `--disable-tools` / `--disable-groups`, any
 * hard-coded "use voicevox_x instead" guidance becomes misleading. Routing every
 * cross-tool reference through these helpers makes it structurally impossible to
 * mention a disabled tool — the reference simply drops out.
 */
import { addToolPrefix, isToolDisabled } from './registration.js'

/**
 * True when a tool is enabled (i.e. not disabled). Accepts both prefixed and
 * unprefixed names.
 */
export function isToolEnabled(disabledTools: Set<string>, name: string): boolean {
  return !isToolDisabled(disabledTools, name)
}

/**
 * Return the full prefixed tool name (e.g. `voicevox_speak`) when the tool is
 * enabled, otherwise `undefined`. Use the result in a truthy check so disabled
 * tools naturally drop out of any guidance string.
 */
export function enabledToolRef(disabledTools: Set<string>, name: string): string | undefined {
  return isToolEnabled(disabledTools, name) ? addToolPrefix(name) : undefined
}

/**
 * Join sentence fragments into a single description, dropping any falsy parts.
 * Lets callers append conditional clauses (e.g. an `enabledToolRef && '...'`
 * expression) without worrying about stray spaces.
 */
export function composeDescription(...parts: Array<string | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p)).join(' ')
}

/**
 * Build a "Next: a (label) | b (label)" hint from only the enabled tools.
 * Returns an empty string when none of the steps are enabled.
 */
export function buildNextHint(
  disabledTools: Set<string>,
  steps: Array<{ name: string; label: string }>,
  prefix = 'Next: '
): string {
  const parts = steps
    .filter((s) => isToolEnabled(disabledTools, s.name))
    .map((s) => `${addToolPrefix(s.name)} (${s.label})`)
  return parts.length > 0 ? `${prefix}${parts.join(' | ')}` : ''
}
