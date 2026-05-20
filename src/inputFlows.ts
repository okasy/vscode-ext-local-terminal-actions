import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action, ActionVariable, getPrimaryCommand } from './types';

/**
 * 通常 UI では先頭コマンドだけ編集し、残りのコマンドは保持します。
 */
function buildCommandsForInput(existing: Action | undefined, firstCommand: string): string[] {
  if (!existing) {
    return [firstCommand];
  }
  return [firstCommand, ...existing.commands.slice(1)];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * VS Code 設定から利用可能なターミナルプロファイル名を取得します。
 * 何も設定されていない場合は妥当な既定値を返します。
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

  const profiles = config.get<Record<string, unknown>>(platform) ?? {};
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
 * ウィザード各ステップ用のローカライズ済みタイトルを組み立てます。
 */
function buildStepTitle(
  label: string,
  step: number,
  totalSteps: number
): string {
  return vscode.l10n.t('{0} (Step {1}/{2})', label, step, totalSteps);
}

type CollectActionInfoMode = 'create' | 'edit';

/**
 * アクション入力ウィザードの挙動を制御する任意設定です。
 */
interface CollectActionInfoOptions {
  mode?: CollectActionInfoMode;
}

const ACTION_WIZARD_STEP_CREATE = {
  section: 1,
  actionName: 2,
  command: 3,
  description: 4,
} as const;

const ACTION_WIZARD_STEP_EDIT = {
  section: 1,
  actionName: 2,
  command: 3,
  onNewTerminalCommand: 4,
  variableDefinitions: 5,
  description: 6,
  runConfirmation: 7,
  terminalReuse: 8,
  terminalProfile: 9,
  workingDirectory: 10,
} as const;

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * 変数定義を編集用テキストへシリアライズします。
 */
function serializeVariableDefinitions(
  variables: ActionVariable[] | undefined
): string {
  if (!variables || variables.length === 0) {
    return '';
  }
  return variables
    .map(variable => {
      if (!variable.options || variable.options.length === 0) {
        return variable.name;
      }
      return `${variable.name}=${variable.options.join('|')}`;
    })
    .join('\n');
}

/**
 * ユーザー入力から変数定義を解析します。
 */
function parseVariableDefinitions(
  rawValue: string
): { variables: ActionVariable[]; error?: string } {
  const normalized = rawValue.trim();
  if (!normalized) {
    return { variables: [] };
  }

  const variables: ActionVariable[] = [];
  const seen = new Set<string>();
  const lines = normalized
    .split(/\r?\n|;/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const equalIndex = line.indexOf('=');
    const hasOptions = equalIndex >= 0;
    const name = (hasOptions ? line.slice(0, equalIndex) : line).trim();

    if (!hasOptions) {
      return {
        variables: [],
        error: vscode.l10n.t(
          'Variable definition "{0}" is invalid. Use name=option1|option2 and include * to allow manual input.',
          line
        ),
      };
    }

    if (!VARIABLE_NAME_PATTERN.test(name)) {
      return {
        variables: [],
        error: vscode.l10n.t(
          'Invalid variable name "{0}". Use letters, numbers, and underscores, and do not start with a number.',
          name || line
        ),
      };
    }
    if (seen.has(name)) {
      return {
        variables: [],
        error: vscode.l10n.t('Variable "{0}" is duplicated.', name),
      };
    }
    seen.add(name);

    const options = line
      .slice(equalIndex + 1)
      .split('|')
      .map(option => option.trim())
      .filter(Boolean);

    if (options.length === 0) {
      return {
        variables: [],
        error: vscode.l10n.t(
          'Variable "{0}" has no options. Add selectable values and include * when manual input should be allowed.',
          name
        ),
      };
    }

    variables.push({ name, options });
  }

  return { variables };
}

/**
 * 入力中の変数定義構文を検証します。
 */
function validateVariableDefinitions(rawValue: string): string | undefined {
  const result = parseVariableDefinitions(rawValue);
  return result.error;
}

/**
 * 既存セクションの選択、または新規セクション名の入力を受け付ける QuickPick を表示します。
 */
async function pickOrCreateSection(
  existingSections: string[],
  totalSteps: number,
  step: number,
  defaultValue?: string
): Promise<string | undefined> {
  return new Promise<string | undefined>(resolve => {
    let settled = false;
    const finish = (value: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const qp = vscode.window.createQuickPick();
    qp.placeholder = vscode.l10n.t('Select a section or type a new name');
    qp.title = buildStepTitle(vscode.l10n.t('Section'), step, totalSteps);
    const defaultSection = 'common';

    /** items を更新し、value に一致する項目を activeItems にセットする */
    const updateItems = (value: string): void => {
      const filtered = existingSections
        .filter(s => s.toLowerCase().includes(value.toLowerCase()))
        .map(s => ({ label: s }));
      if (value.trim() && !existingSections.includes(value.trim())) {
        qp.items = [
          {
            label: value.trim(),
            description: vscode.l10n.t('(new section)'),
          },
          ...filtered,
        ];
      } else {
        qp.items = filtered;
      }
      const match = qp.items.find(
        i => i.label.toLowerCase() === value.trim().toLowerCase()
      );
      if (match) {
        qp.activeItems = [match];
      }
    };

    if (existingSections.length === 0) {
      qp.items = [
        {
          label: defaultSection,
          description: vscode.l10n.t('(new section)'),
        },
      ];
    } else {
      qp.items = existingSections.map(s => ({ label: s }));
    }

    const initialValue = defaultValue ?? (existingSections.length === 0 ? defaultSection : '');
    if (initialValue) {
      qp.value = initialValue;
      updateItems(initialValue);
    }

    qp.onDidChangeValue(value => {
      updateItems(value);
    });

    qp.onDidAccept(() => {
      const value =
        qp.selectedItems[0]?.label ?? qp.value.trim();
      finish(value || undefined);
      qp.dispose();
    });

    qp.onDidHide(() => {
      qp.dispose();
      finish(undefined);
    });

    qp.show();
  });
}

/**
 * picked: true が付いた項目を事前選択状態で表示する単一選択 QuickPick を表示します。
 * vscode.window.showQuickPick は単一選択では picked を無視するため、
 * より低レベルな createQuickPick() API を使って activeItems を明示設定します。
 */
async function showQuickPickWithDefault(
  items: vscode.QuickPickItem[],
  options: { title?: string; placeHolder?: string }
): Promise<vscode.QuickPickItem | undefined> {
  return new Promise<vscode.QuickPickItem | undefined>(resolve => {
    let settled = false;
    const finish = (value: vscode.QuickPickItem | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const qp = vscode.window.createQuickPick();
    if (options.title) {
      qp.title = options.title;
    }
    if (options.placeHolder) {
      qp.placeholder = options.placeHolder;
    }
    qp.items = items;

    const defaultItem = items.find(i => i.picked);
    if (defaultItem) {
      qp.activeItems = [defaultItem];
    }

    qp.onDidAccept(() => {
      finish(qp.selectedItems[0]);
      qp.dispose();
    });

    qp.onDidHide(() => {
      qp.dispose();
      finish(undefined);
    });

    qp.show();
  });
}

// ---------------------------------------------------------------------------
// Main multi-step input flow
// ---------------------------------------------------------------------------

/**
 * アクションの各入力項目を収集する複数ステップのウィザードを実行します。
 *
 * @param actionsManager 既存セクション名の参照に使用します。
 * @param existing 既存アクション編集時の初期値として使用します。
 * @param options ウィザードを create / edit のどちらで動かすかを制御します。
 * @returns 収集した値を返します。キャンセル時は undefined を返します。
 */
export async function collectActionInfo(
  actionsManager: ActionsManager,
  existing?: Action,
  options?: CollectActionInfoOptions
): Promise<Omit<Action, 'id'> | undefined> {
  const mode = options?.mode ?? 'edit';
  const isCreateMode = mode === 'create';
  const totalSteps = isCreateMode ? 4 : 10;
  const stepConfig = isCreateMode
    ? ACTION_WIZARD_STEP_CREATE
    : ACTION_WIZARD_STEP_EDIT;

  const existingSections = actionsManager.getSections();
  const section = await pickOrCreateSection(
    existingSections,
    totalSteps,
    stepConfig.section,
    existing?.section
  );
  if (!section) {
    return undefined;
  }

  const name = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Action name (e.g. "Start services")'),
    title: buildStepTitle(
      vscode.l10n.t('Action Name'),
      stepConfig.actionName,
      totalSteps
    ),
    value: existing?.name ?? '',
    validateInput: v =>
      v.trim() ? undefined : vscode.l10n.t('Name is required'),
  });
  if (name === undefined) {
    return undefined;
  }

  const command = await vscode.window.showInputBox({
    prompt: isCreateMode
      ? vscode.l10n.t('Command to execute (e.g. "docker compose up -d")')
      : vscode.l10n.t(
          'Command to execute (e.g. "docker compose up -d ${name}"). Use ${name} for variables and define them in Variable Definitions.'
        ),
    title: buildStepTitle(
      vscode.l10n.t('Command'),
      stepConfig.command,
      totalSteps
    ),
    value: existing ? getPrimaryCommand(existing) : '',
    validateInput: v =>
      v.trim() ? undefined : vscode.l10n.t('Command is required'),
  });
  if (command === undefined) {
    return undefined;
  }

  // Add new では複雑な設定を表示しない
  if (isCreateMode) {
    const description = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Short description (optional)'),
      title: buildStepTitle(
        vscode.l10n.t('Description'),
        stepConfig.description,
        totalSteps
      ),
      value: existing?.description ?? '',
    });
    if (description === undefined) {
      return undefined;
    }

    return {
      section: section.trim(),
      name: name.trim(),
      commands: buildCommandsForInput(existing, command.trim()),
      description: description.trim() || undefined,
    };
  }

  const onNewTerminalCommand = await vscode.window.showInputBox({
    prompt: vscode.l10n.t(
      'Optional. Command to run right after creating a new terminal, before the action command.'
    ),
    title: buildStepTitle(
      vscode.l10n.t('New Terminal Pre-Command'),
      ACTION_WIZARD_STEP_EDIT.onNewTerminalCommand,
      totalSteps
    ),
    value: existing?.onNewTerminalCommand ?? '',
    placeHolder: vscode.l10n.t('e.g. source .env.local'),
  });
  if (onNewTerminalCommand === undefined) {
    return undefined;
  }

  const variablesInput = await vscode.window.showInputBox({
    prompt: vscode.l10n.t(
      'Optional. One variable per line: name=option1|option2|*. `*` allows manual input. Use ${name} in command.'
    ),
    title: buildStepTitle(
      vscode.l10n.t('Variable Definitions'),
      ACTION_WIZARD_STEP_EDIT.variableDefinitions,
      totalSteps
    ),
    value: serializeVariableDefinitions(existing?.variables),
    placeHolder: vscode.l10n.t('target=ingame|outgame|admin|*'),
    validateInput: validateVariableDefinitions,
  });
  if (variablesInput === undefined) {
    return undefined;
  }
  const variableParseResult = parseVariableDefinitions(variablesInput);
  if (variableParseResult.error) {
    vscode.window.showErrorMessage(variableParseResult.error);
    return undefined;
  }

  const description = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Short description (optional)'),
    title: buildStepTitle(
      vscode.l10n.t('Description'),
      ACTION_WIZARD_STEP_EDIT.description,
      totalSteps
    ),
    value: existing?.description ?? '',
  });
  if (description === undefined) {
    return undefined;
  }

  const confirmOnLabel = vscode.l10n.t(
    '$(question) Require confirmation before run'
  );
  const confirmOffLabel = vscode.l10n.t(
    '$(check) Run immediately without confirmation'
  );
  const confirmItems: vscode.QuickPickItem[] = [
    {
      label: confirmOnLabel,
      picked: existing?.confirmBeforeRun === true,
    },
    {
      label: confirmOffLabel,
      picked: existing?.confirmBeforeRun !== true,
    },
  ];
  const confirmPick = await showQuickPickWithDefault(confirmItems, {
    placeHolder: vscode.l10n.t(
      'Confirmation behavior before action execution'
    ),
    title: buildStepTitle(
      vscode.l10n.t('Run Confirmation'),
      ACTION_WIZARD_STEP_EDIT.runConfirmation,
      totalSteps
    ),
  });
  if (confirmPick === undefined) {
    return undefined;
  }
  const confirmBeforeRun = confirmPick.label === confirmOnLabel;

  const reuseLabel = vscode.l10n.t('$(terminal) Reuse existing terminal');
  const newLabel = vscode.l10n.t('$(add) Always create a new terminal');
  const reuseItems: vscode.QuickPickItem[] = [
    {
      label: reuseLabel,
      description: vscode.l10n.t(
        'Reuse the terminal for this section (recommended)'
      ),
      picked: existing?.reuseTerminal !== false,
    },
    {
      label: newLabel,
      description: vscode.l10n.t('Open a fresh terminal every time'),
      picked: existing?.reuseTerminal === false,
    },
  ];

  const reusePick = await showQuickPickWithDefault(reuseItems, {
    placeHolder: vscode.l10n.t('Terminal reuse behavior'),
    title: buildStepTitle(
      vscode.l10n.t('Terminal Reuse'),
      ACTION_WIZARD_STEP_EDIT.terminalReuse,
      totalSteps
    ),
  });
  if (reusePick === undefined) {
    return undefined;
  }
  const reuseTerminal = reusePick.label === reuseLabel;

  const profiles = getTerminalProfiles();
  const defaultProfileLabel = vscode.l10n.t(
    '$(terminal) Default (VS Code default)'
  );
  const profileItems: vscode.QuickPickItem[] = [
    {
      label: defaultProfileLabel,
      description: vscode.l10n.t('Use the VS Code default terminal'),
    },
    ...profiles.map(p => ({ label: p })),
  ];

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

  const profilePick = await showQuickPickWithDefault(profileItems, {
    placeHolder: vscode.l10n.t('Select terminal profile'),
    title: buildStepTitle(
      vscode.l10n.t('Terminal Profile'),
      ACTION_WIZARD_STEP_EDIT.terminalProfile,
      totalSteps
    ),
  });
  if (profilePick === undefined) {
    return undefined;
  }
  const terminalProfile =
    profilePick.label === defaultProfileLabel
      ? undefined
      : profilePick.label;

  const cwd = await vscode.window.showInputBox({
    prompt: vscode.l10n.t(
      'Working directory (leave empty for workspace root). Supports ${workspaceFolder}.'
    ),
    title: buildStepTitle(
      vscode.l10n.t('Working Directory'),
      ACTION_WIZARD_STEP_EDIT.workingDirectory,
      totalSteps
    ),
    value: existing?.cwd ?? '',
    placeHolder: vscode.l10n.t('${workspaceFolder}'),
  });
  if (cwd === undefined) {
    return undefined;
  }

  return {
    section: section.trim(),
    name: name.trim(),
    commands: buildCommandsForInput(existing, command.trim()),
    onNewTerminalCommand: onNewTerminalCommand.trim() || undefined,
    terminalProfile,
    reuseTerminal,
    cwd: cwd.trim() || undefined,
    description: description.trim() || undefined,
    variables:
      variableParseResult.variables.length > 0
        ? variableParseResult.variables
        : undefined,
    confirmBeforeRun,
  };
}
