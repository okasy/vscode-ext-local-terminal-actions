import * as vscode from 'vscode';
import { Action } from './types';

interface TerminalProfileConfig {
  path?: string | string[];
  args?: string[];
  source?: string;
}

/**
 * Returns the shell executable path for a named terminal profile,
 * read from VS Code's terminal.integrated.profiles settings.
 */
function getShellForProfile(profileName: string): string | undefined {
  const config = vscode.workspace.getConfiguration('terminal.integrated.profiles');
  const platform =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
      ? 'osx'
      : 'linux';

  const profiles =
    config.get<Record<string, TerminalProfileConfig | null>>(platform) ?? {};
  const profile = profiles[profileName];
  if (!profile) {
    return undefined;
  }

  const profilePath = profile.path;
  if (typeof profilePath === 'string') {
    return profilePath;
  }
  if (Array.isArray(profilePath) && profilePath.length > 0) {
    return profilePath[0];
  }
  return undefined;
}

/**
 * Manages VS Code terminal instances and runs action commands.
 */
export class TerminalManager {
  /** Tracks reusable terminals keyed by section name */
  private readonly terminals = new Map<string, vscode.Terminal>();

  async runAction(action: Action): Promise<void> {
    const terminal = this.getOrCreateTerminal(action);
    terminal.show(true);
    // Brief pause to allow the shell to become ready if freshly created
    await new Promise<void>(resolve => setTimeout(resolve, 300));
    terminal.sendText(action.command);
  }

  private getOrCreateTerminal(action: Action): vscode.Terminal {
    const terminalName = `[LTA] ${action.section}`;
    const shouldReuse = action.reuseTerminal !== false;

    if (shouldReuse) {
      // Prefer a live terminal with the matching name
      const existing = vscode.window.terminals.find(t => t.name === terminalName);
      if (existing) {
        return existing;
      }
      // Fall back to our tracked map (may have been opened before)
      const tracked = this.terminals.get(terminalName);
      if (tracked && vscode.window.terminals.includes(tracked)) {
        return tracked;
      }
      this.terminals.delete(terminalName);
    }

    const options: vscode.TerminalOptions = { name: terminalName };

    // Apply terminal profile shell path if available
    if (action.terminalProfile) {
      const shellPath = getShellForProfile(action.terminalProfile);
      if (shellPath) {
        options.shellPath = shellPath;
      }
    }

    // Apply working directory with ${workspaceFolder} substitution
    if (action.cwd) {
      const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      options.cwd = action.cwd.replace('${workspaceFolder}', workspaceRoot);
    }

    const terminal = vscode.window.createTerminal(options);

    if (shouldReuse) {
      this.terminals.set(terminalName, terminal);

      // Remove from the map when the terminal is closed
      const disposable = vscode.window.onDidCloseTerminal(closed => {
        if (closed === terminal) {
          this.terminals.delete(terminalName);
          disposable.dispose();
        }
      });
    }

    return terminal;
  }
}
