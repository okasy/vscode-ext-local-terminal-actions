/**
 * Data model for a single terminal action.
 */
export interface ActionVariable {
  /** Variable name used in command placeholders, e.g. ${target} */
  name: string;
  /** Select options. When omitted or empty, free text input is used. */
  options?: string[];
}

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
  /** Optional variable definitions used by command placeholders */
  variables?: ActionVariable[];
  /** Whether confirmation is required before running this action */
  confirmBeforeRun?: boolean;
}

/**
 * Runtime status for action execution shown in the Actions tree.
 */
export type ActionExecutionStatus = 'idle' | 'running' | 'success' | 'warning' | 'error';

/**
 * Root structure of .vscode/actions.json
 */
export interface ActionsData {
  /** Explicit section order used by the tree view */
  sections?: string[];
  actions: Action[];
}
