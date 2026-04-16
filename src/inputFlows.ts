import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns terminal profile names available in VS Code's settings,
 * with sensible defaults when none are configured.
 */
export function getTerminalProfiles(): string[] {
  const config = vscode.workspace.getConfiguration(
    'terminal.integrated.profiles'
  );
  const platform =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
      ? 'osx'
      : 'linux';

  const profiles =
    config.get<Record<string, unknown>>(platform) ?? {};
  const names = Object.entries(profiles)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);

  if (names.length === 0) {
    return process.platform === 'win32'
      ? ['PowerShell', 'Command Prompt', 'Git Bash']
      : ['bash', 'zsh', 'sh', 'fish'];
  }
  return names;
}

/**
 * Shows a QuickPick that allows the user to select an existing section
 * or type a new section name.
 */
async function pickOrCreateSection(
  existingSections: string[],
  defaultValue?: string
): Promise<string | undefined> {
  return new Promise<string | undefined>(resolve => {
    const qp = vscode.window.createQuickPick();
    qp.placeholder = 'Select a section or type a new name';
    qp.title = 'Section (Step 1/7)';
    qp.items = existingSections.map(s => ({ label: s }));
    if (defaultValue) {
      qp.value = defaultValue;
    }

    qp.onDidChangeValue(value => {
      const filtered = existingSections
        .filter(s => s.toLowerCase().includes(value.toLowerCase()))
        .map(s => ({ label: s }));
      if (value.trim() && !existingSections.includes(value.trim())) {
        qp.items = [
          { label: value.trim(), description: '(new section)' },
          ...filtered,
        ];
      } else {
        qp.items = filtered;
      }
    });

    qp.onDidAccept(() => {
      const value =
        qp.selectedItems[0]?.label ?? qp.value.trim();
      qp.dispose();
      resolve(value || undefined);
    });

    qp.onDidHide(() => {
      qp.dispose();
      resolve(undefined);
    });

    qp.show();
  });
}

// ---------------------------------------------------------------------------
// Main multi-step input flow
// ---------------------------------------------------------------------------

/**
 * Runs a multi-step wizard to collect all fields for an action.
 *
 * @param actionsManager  Used to look up existing section names.
 * @param existing        Pre-fill fields when editing an existing action.
 * @returns The collected fields (without id), or undefined if cancelled.
 */
export async function collectActionInfo(
  actionsManager: ActionsManager,
  existing?: Action
): Promise<Omit<Action, 'id'> | undefined> {
  // ------------------------------------------------------------------
  // Step 1: Section
  // ------------------------------------------------------------------
  const existingSections = actionsManager.getSections();
  const section = await pickOrCreateSection(
    existingSections,
    existing?.section
  );
  if (!section) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // Step 2: Action name
  // ------------------------------------------------------------------
  const name = await vscode.window.showInputBox({
    prompt: 'Action name (e.g. "Start services")',
    title: 'Action Name (Step 2/7)',
    value: existing?.name ?? '',
    validateInput: v => (v.trim() ? undefined : 'Name is required'),
  });
  if (name === undefined) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // Step 3: Command
  // ------------------------------------------------------------------
  const command = await vscode.window.showInputBox({
    prompt: 'Command to execute (e.g. "docker compose up -d")',
    title: 'Command (Step 3/7)',
    value: existing?.command ?? '',
    validateInput: v => (v.trim() ? undefined : 'Command is required'),
  });
  if (command === undefined) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // Step 4: Terminal profile
  // ------------------------------------------------------------------
  const profiles = getTerminalProfiles();
  const defaultProfileLabel = '$(terminal) Default (VS Code default)';
  const profileItems: vscode.QuickPickItem[] = [
    {
      label: defaultProfileLabel,
      description: 'Use the VS Code default terminal',
    },
    ...profiles.map(p => ({ label: p })),
  ];

  // Mark the currently selected profile
  if (existing?.terminalProfile) {
    const idx = profileItems.findIndex(
      i => i.label === existing.terminalProfile
    );
    if (idx >= 0) {
      profileItems[idx] = { ...profileItems[idx], picked: true };
    }
  } else {
    profileItems[0] = { ...profileItems[0], picked: true };
  }

  const profilePick = await vscode.window.showQuickPick(profileItems, {
    placeHolder: 'Select terminal profile',
    title: 'Terminal Profile (Step 4/7)',
  });
  if (profilePick === undefined) {
    return undefined;
  }
  const terminalProfile =
    profilePick.label === defaultProfileLabel
      ? undefined
      : profilePick.label;

  // ------------------------------------------------------------------
  // Step 5: Reuse terminal
  // ------------------------------------------------------------------
  const reuseLabel = '$(terminal) Reuse existing terminal';
  const newLabel = '$(add) Always create a new terminal';
  const reuseItems: vscode.QuickPickItem[] = [
    {
      label: reuseLabel,
      description: 'Reuse the terminal for this section (recommended)',
      picked: existing?.reuseTerminal !== false,
    },
    {
      label: newLabel,
      description: 'Open a fresh terminal every time',
      picked: existing?.reuseTerminal === false,
    },
  ];

  const reusePick = await vscode.window.showQuickPick(reuseItems, {
    placeHolder: 'Terminal reuse behavior',
    title: 'Terminal Reuse (Step 5/7)',
  });
  if (reusePick === undefined) {
    return undefined;
  }
  const reuseTerminal = reusePick.label === reuseLabel;

  // ------------------------------------------------------------------
  // Step 6: Working directory
  // ------------------------------------------------------------------
  const cwd = await vscode.window.showInputBox({
    prompt:
      'Working directory (leave empty for workspace root). Supports ${workspaceFolder}.',
    title: 'Working Directory (Step 6/7)',
    value: existing?.cwd ?? '',
    placeHolder: '${workspaceFolder}',
  });
  if (cwd === undefined) {
    return undefined;
  }

  // ------------------------------------------------------------------
  // Step 7: Description
  // ------------------------------------------------------------------
  const description = await vscode.window.showInputBox({
    prompt: 'Short description (optional)',
    title: 'Description (Step 7/7)',
    value: existing?.description ?? '',
  });
  if (description === undefined) {
    return undefined;
  }

  return {
    section: section.trim(),
    name: name.trim(),
    command: command.trim(),
    terminalProfile,
    reuseTerminal,
    cwd: cwd.trim() || undefined,
    description: description.trim() || undefined,
  };
}
