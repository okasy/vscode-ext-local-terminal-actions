/**
 * Data model for a single terminal action.
 */
export interface Action {
  /** Unique identifier (auto-generated) */
  id: string;
  /** Section/group name shown as a collapsible tree branch */
  section: string;
  /** Display name of the action */
  name: string;
  /** Shell command to execute (e.g. "docker compose up -d") */
  command: string;
  /** Terminal profile name (e.g. "bash", "zsh", "PowerShell") */
  terminalProfile?: string;
  /**
   * Whether to reuse an existing terminal for this section.
   * Defaults to true when undefined.
   */
  reuseTerminal?: boolean;
  /**
   * Working directory for the command.
   * Supports ${workspaceFolder} substitution.
   */
  cwd?: string;
  /** Optional human-readable description */
  description?: string;
}

/**
 * Root structure of .vscode/actions.json
 */
export interface ActionsData {
  actions: Action[];
}
