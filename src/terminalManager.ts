import * as vscode from 'vscode';
import { Action } from './types';

interface TerminalProfileConfig {
  path?: string | string[];
  args?: string[];
  source?: string;
}

interface PendingExecution {
  action: Action;
  expectedCommand: string;
}

interface ExecutionTrackingCallbacks {
  onRunning?: (action: Action) => void;
  onCompleted?: (action: Action, exitCode: number | undefined) => void;
  getCommonOnNewTerminalCommand?: () => string | undefined;
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

  /** Tracks the latest terminal used by each action */
  private readonly actionTerminals = new Map<string, vscode.Terminal>();

  private readonly pendingExecutions = new Map<vscode.Terminal, PendingExecution[]>();

  private readonly trackedExecutions = new WeakMap<
    vscode.TerminalShellExecution,
    Action
  >();

  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly callbacks: ExecutionTrackingCallbacks = {}) {
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution(event => {
        this.handleExecutionStart(event);
      }),
      vscode.window.onDidEndTerminalShellExecution(event => {
        this.handleExecutionEnd(event);
      }),
      vscode.window.onDidCloseTerminal(closed => {
        this.cleanupClosedTerminal(closed);
      })
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  async runAction(action: Action): Promise<void> {
    const resolvedCommand = await this.resolveCommand(action);
    if (resolvedCommand === undefined) {
      return;
    }

    if (action.confirmBeforeRun) {
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t('Run action "{0}"?', action.name),
        { modal: true, detail: resolvedCommand },
        vscode.l10n.t('Run')
      );
      if (answer !== vscode.l10n.t('Run')) {
        return;
      }
    }

    const { terminal, created } = this.getOrCreateTerminal(action);
    this.actionTerminals.set(action.id, terminal);
    terminal.show(true);
    // Brief pause to allow the shell to become ready if freshly created
    await new Promise<void>(resolve => setTimeout(resolve, 300));

    if (created) {
      const commonPreCommand =
        this.callbacks.getCommonOnNewTerminalCommand?.()?.trim() || undefined;
      if (commonPreCommand) {
        terminal.sendText(commonPreCommand);
      }

      if (action.onNewTerminalCommand?.trim()) {
        terminal.sendText(action.onNewTerminalCommand.trim());
      }
    }

    this.enqueuePendingExecution(terminal, action, resolvedCommand);
    terminal.sendText(resolvedCommand);
  }

  focusActionTerminal(action: Action): boolean {
    const terminal = this.actionTerminals.get(action.id);
    if (!terminal || !vscode.window.terminals.includes(terminal)) {
      this.actionTerminals.delete(action.id);
      return false;
    }
    terminal.show(true);
    return true;
  }

  closeActionTerminal(action: Action): boolean {
    const terminal = this.actionTerminals.get(action.id);
    if (!terminal || !vscode.window.terminals.includes(terminal)) {
      this.actionTerminals.delete(action.id);
      return false;
    }
    this.actionTerminals.delete(action.id);
    terminal.dispose();
    return true;
  }

  private async resolveCommand(action: Action): Promise<string | undefined> {
    const matches = [...action.command.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)];
    const variableNames = [...new Set(matches.map(match => match[1]))];
    if (variableNames.length === 0) {
      return action.command;
    }

    const values = new Map<string, string>();
    for (const variableName of variableNames) {
      const definition = action.variables?.find(v => v.name === variableName);
      if (!definition) {
        vscode.window.showErrorMessage(
          vscode.l10n.t(
            'Variable "{0}" is not defined. Add a variable definition with selectable values and include * when manual input should be allowed.',
            variableName
          )
        );
        return undefined;
      }

      const normalizedOptions = (definition?.options ?? [])
        .map(option => option.trim())
        .filter(Boolean);
      const allowsFreeInput = normalizedOptions.includes('*');
      const fixedOptions = normalizedOptions.filter(option => option !== '*');

      if (fixedOptions.length > 0) {
        const customInputLabel = vscode.l10n.t('$(edit) Enter custom value');
        const selected = await vscode.window.showQuickPick(
          [
            ...fixedOptions.map(option => ({ label: option })),
            ...(allowsFreeInput
              ? [
                  {
                    label: customInputLabel,
                    description: vscode.l10n.t('Use manual input'),
                  },
                ]
              : []),
          ],
          {
            title: vscode.l10n.t('Variable: {0}', variableName),
            placeHolder: allowsFreeInput
              ? vscode.l10n.t('Select value for "{0}" or choose custom input', variableName)
              : vscode.l10n.t('Select value for "{0}"', variableName),
          }
        );
        if (!selected) {
          return undefined;
        }

        if (allowsFreeInput && selected.label === customInputLabel) {
          const customValue = await vscode.window.showInputBox({
            title: vscode.l10n.t('Variable: {0}', variableName),
            prompt: vscode.l10n.t('Enter value for "{0}"', variableName),
            validateInput: v =>
              v.trim() ? undefined : vscode.l10n.t('Value is required'),
          });
          if (customValue === undefined) {
            return undefined;
          }
          values.set(variableName, customValue);
        } else {
          values.set(variableName, selected.label);
        }
        continue;
      }

      if (allowsFreeInput) {
        const input = await vscode.window.showInputBox({
          title: vscode.l10n.t('Variable: {0}', variableName),
          prompt: vscode.l10n.t('Enter value for "{0}"', variableName),
          validateInput: v =>
            v.trim() ? undefined : vscode.l10n.t('Value is required'),
        });
        if (input === undefined) {
          return undefined;
        }
        values.set(variableName, input);
        continue;
      }

      vscode.window.showErrorMessage(
        vscode.l10n.t(
          'Variable "{0}" has no selectable values. Add options and include * when manual input should be allowed.',
          variableName
        )
      );
      return undefined;
    }

    let resolvedCommand = action.command;
    for (const [name, value] of values) {
      const placeholder = `\${${name}}`;
      resolvedCommand = resolvedCommand.split(placeholder).join(value);
    }
    return resolvedCommand;
  }

  private enqueuePendingExecution(
    terminal: vscode.Terminal,
    action: Action,
    expectedCommand: string
  ): void {
    const queue = this.pendingExecutions.get(terminal) ?? [];
    queue.push({ action, expectedCommand: expectedCommand.trim() });
    this.pendingExecutions.set(terminal, queue);
  }

  private handleExecutionStart(event: vscode.TerminalShellExecutionStartEvent): void {
    const queue = this.pendingExecutions.get(event.terminal);
    if (!queue || queue.length === 0) {
      return;
    }

    const actual = event.execution.commandLine.value.trim();
    const index = queue.findIndex(pending => this.isCommandMatch(actual, pending.expectedCommand));
    if (index < 0) {
      return;
    }
    const [matched] = queue.splice(index, 1);

    if (queue.length === 0) {
      this.pendingExecutions.delete(event.terminal);
    }

    if (!matched) {
      return;
    }

    this.trackedExecutions.set(event.execution, matched.action);
    this.callbacks.onRunning?.(matched.action);
  }

  private handleExecutionEnd(event: vscode.TerminalShellExecutionEndEvent): void {
    const action = this.trackedExecutions.get(event.execution);
    if (!action) {
      return;
    }
    this.callbacks.onCompleted?.(action, event.exitCode);
  }

  private cleanupClosedTerminal(closed: vscode.Terminal): void {
    for (const [name, terminal] of this.terminals) {
      if (terminal === closed) {
        this.terminals.delete(name);
      }
    }

    for (const [actionId, terminal] of this.actionTerminals) {
      if (terminal === closed) {
        this.actionTerminals.delete(actionId);
      }
    }

    this.pendingExecutions.delete(closed);
  }

  private isCommandMatch(actual: string, expected: string): boolean {
    if (actual === expected) {
      return true;
    }
    return actual.includes(expected);
  }

  private getOrCreateTerminal(action: Action): {
    terminal: vscode.Terminal;
    created: boolean;
  } {
    const terminalName = `[LTA] ${action.section}`;
    const shouldReuse = action.reuseTerminal !== false;

    if (shouldReuse) {
      // Prefer a live terminal with the matching name
      const existing = vscode.window.terminals.find(t => t.name === terminalName);
      if (existing) {
        return { terminal: existing, created: false };
      }
      // Fall back to our tracked map (may have been opened before)
      const tracked = this.terminals.get(terminalName);
      if (tracked && vscode.window.terminals.includes(tracked)) {
        return { terminal: tracked, created: false };
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
    }

    return { terminal, created: true };
  }
}
