/**
 * Built-in tool group definitions for batch enable/disable via --disable-groups.
 *
 * Groups map logical feature names to the list of tool names they contain.
 * Tool names are unprefixed (the voicevox_ prefix is handled by registration).
 */
export const TOOL_GROUPS: Record<string, string[]> = {
  /** All player UI tools */
  player: ['speak_player', 'resynthesize_player', 'get_player_state', 'open_dictionary_ui'],
  /** All dictionary tools (read + write) */
  dictionary: [
    'get_accent_phrases',
    'get_user_dictionary',
    'add_user_dictionary_word',
    'update_user_dictionary_word',
    'delete_user_dictionary_word',
    'add_user_dictionary_words',
    'update_user_dictionary_words',
  ],
  /** Audio file synthesis tool */
  file: ['synthesize_file'],
  /** MCP App tools (tools registered as UI apps, i.e. with registerAppTool) */
  apps: ['speak_player', 'resynthesize_player', 'open_dictionary_ui'],
}

/**
 * Expand a list of group names into individual tool names.
 * Unknown group names are logged and skipped.
 */
export function expandGroups(groupNames: string[]): string[] {
  const tools: string[] = []
  for (const name of groupNames) {
    const members = TOOL_GROUPS[name]
    if (members) {
      tools.push(...members)
    } else {
      console.error(`[mcp-tts] Unknown tool group: "${name}". Valid groups: ${Object.keys(TOOL_GROUPS).join(', ')}`)
    }
  }
  return tools
}
