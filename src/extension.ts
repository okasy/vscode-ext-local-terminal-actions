import * as vscode from 'vscode';
import * as path from 'path';
import { ActionsManager } from './actionsManager';
import { ActionsProvider, ActionItem, SectionItem } from './actionsProvider';
import {
  SettingProvider,
  SettingActionItem,
  SettingSectionItem,
  CommonOnNewTerminalCommandItem,
  NewTerminalDelaySecondsItem,
} from './settingProvider';
import { TerminalManager } from './terminalManager';
import { collectActionInfo } from './inputFlows';
import { ActionExecutionStatus } from './types';

type TreeSubtextMode = 'command' | 'description' | 'hidden';
const EDIT_MODE_CONTEXT_KEY = 'localTerminalActions.editMode';

/**
 * アクションツリーに適用するサブテキスト表示モードを返します。
 */
function getTreeSubtextMode(): TreeSubtextMode {
  const mode = vscode.workspace
    .getConfiguration('localTerminalActions')
    .get<string>('treeSubtextMode', 'command');
  if (mode === 'description' || mode === 'hidden') {
    return mode;
  }
  return 'command';
}

/**
 * UI トグル循環における次のサブテキスト表示モードを返します。
 */
function getNextTreeSubtextMode(mode: TreeSubtextMode): TreeSubtextMode {
  switch (mode) {
    case 'command':
      return 'description';
    case 'description':
      return 'hidden';
    case 'hidden':
    default:
      return 'command';
  }
}

/**
 * 拡張を有効化し、各ツリービュー、コマンド、監視を登録します。
 */
export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const actionsManager = new ActionsManager(workspaceRoot, context.extensionPath);
  actionsManager.normalizePersistedData();
  const actionsProvider = new ActionsProvider(actionsManager);
  const generalSettingProvider = new SettingProvider(actionsManager, 'general');
  const editActionsSettingProvider = new SettingProvider(actionsManager, 'editActions');
  const updateActionStatus = (actionId: string, status: ActionExecutionStatus): void => {
    actionsProvider.setActionStatus(actionId, status);
  };
  const terminalManager = new TerminalManager({
    getCommonOnNewTerminalCommand: () =>
      actionsManager.getCommonOnNewTerminalCommand(),
    getNewTerminalDelaySeconds: () =>
      actionsManager.getNewTerminalDelaySeconds(),
    onRunning: action => {
      updateActionStatus(action.id, 'running');
    },
    onCompleted: (action, exitCode) => {
      if (exitCode === 0) {
        updateActionStatus(action.id, 'success');
        return;
      }
      if (exitCode === undefined) {
        updateActionStatus(action.id, 'warning');
        return;
      }
      updateActionStatus(action.id, 'error');
    },
  });

  const editActionsSettingTreeView = vscode.window.createTreeView(
    'localTerminalActions.settingEditActions',
    {
      treeDataProvider: editActionsSettingProvider,
      dragAndDropController: editActionsSettingProvider,
    }
  );

  const refreshAll = (): void => {
    actionsProvider.refresh();
    generalSettingProvider.refresh();
    editActionsSettingProvider.refresh();
  };
  const updateSubtextModeContext = async (): Promise<void> => {
    await vscode.commands.executeCommand(
      'setContext',
      'localTerminalActions.subtextMode',
      getTreeSubtextMode()
    );
  };
  const updateTreeSubtextMode = async (mode: TreeSubtextMode): Promise<void> => {
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await vscode.workspace
      .getConfiguration('localTerminalActions')
      .update('treeSubtextMode', mode, target);
  };
  const setEditMode = async (enabled: boolean): Promise<void> => {
    await vscode.commands.executeCommand('setContext', EDIT_MODE_CONTEXT_KEY, enabled);
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'localTerminalActions.actions',
      actionsProvider
    ),
    vscode.window.registerTreeDataProvider(
      'localTerminalActions.settingGeneral',
      generalSettingProvider
    ),
    editActionsSettingTreeView,
    terminalManager
  );

  // ------------------------------------------------------------------
  // Watch .vscode/actions.json for external changes (e.g. git pull)
  // ------------------------------------------------------------------
  if (workspaceRoot) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, '.vscode/actions.json')
    );
    context.subscriptions.push(
      watcher,
      watcher.onDidChange(refreshAll),
      watcher.onDidCreate(refreshAll),
      watcher.onDidDelete(refreshAll)
    );
  }

  void updateSubtextModeContext();
  void setEditMode(false);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('localTerminalActions.treeSubtextMode')) {
        refreshAll();
        void updateSubtextModeContext();
      }
    })
  );

  // ------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------

  const runActionItem = async (item: ActionItem): Promise<void> => {
    await terminalManager.runAction(item.action);
  };

  context.subscriptions.push(
    // Run an action from the Actions view
    vscode.commands.registerCommand(
      'localTerminalActions.runAction',
      runActionItem
    ),

    // Run an action that requires confirmation (separate icon for inline action)
    vscode.commands.registerCommand(
      'localTerminalActions.runActionWithConfirm',
      runActionItem
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.enterEditMode',
      async () => {
        await setEditMode(true);
        await vscode.commands.executeCommand('localTerminalActions.settingEditActions.focus');
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.exitEditMode',
      async () => {
        await setEditMode(false);
        await vscode.commands.executeCommand('localTerminalActions.actions.focus');
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.focusActionTerminal',
      async (item: ActionItem) => {
        if (!terminalManager.focusActionTerminal(item.action)) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('No terminal found for action "{0}".', item.action.name)
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.closeActionTerminal',
      async (item: ActionItem) => {
        if (!terminalManager.closeActionTerminal(item.action)) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('No terminal found for action "{0}".', item.action.name)
          );
          return;
        }
        actionsProvider.clearActionStatus(item.action.id);
        vscode.window.showInformationMessage(
          vscode.l10n.t('Terminal for action "{0}" closed.', item.action.name)
        );
      }
    ),

    // Add a new action (triggered from Setting view title bar)
    vscode.commands.registerCommand(
      'localTerminalActions.addAction',
      async () => {
        if (!actionsManager.hasWorkspace()) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Terminal Actions: Please open a workspace folder first.')
          );
          return;
        }
        const data = await collectActionInfo(actionsManager, undefined, {
          mode: 'create',
        });
        if (data) {
          actionsManager.addAction(data);
          refreshAll();
          vscode.window.showInformationMessage(
            vscode.l10n.t('Action "{0}" added.', data.name)
          );
        }
      }
    ),

    // Edit an existing action (triggered from Setting view item)
    vscode.commands.registerCommand(
      'localTerminalActions.editAction',
      async (item: SettingActionItem) => {
        const data = await collectActionInfo(actionsManager, item.action, {
          mode: 'edit',
        });
        if (data) {
          actionsManager.updateAction({ ...data, id: item.action.id });
          refreshAll();
          vscode.window.showInformationMessage(
            vscode.l10n.t('Action "{0}" updated.', data.name)
          );
        }
      }
    ),

    // Delete an action (triggered from Setting view item)
    vscode.commands.registerCommand(
      'localTerminalActions.deleteAction',
      async (item: SettingActionItem) => {
        const answer = await vscode.window.showWarningMessage(
          vscode.l10n.t('Delete action "{0}"?', item.action.name),
          { modal: true },
          vscode.l10n.t('Delete')
        );
        if (answer === vscode.l10n.t('Delete')) {
          actionsManager.deleteAction(item.action.id);
          refreshAll();
          vscode.window.showInformationMessage(
            vscode.l10n.t('Action "{0}" deleted.', item.action.name)
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.duplicateAction',
      async (item: SettingActionItem) => {
        const duplicated = actionsManager.duplicateAction(item.action.id);
        if (!duplicated) {
          return;
        }
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Action "{0}" duplicated.', duplicated.name)
        );
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.renameSection',
      async (item: SectionItem | SettingSectionItem) => {
        const existing = actionsManager.getSections();
        const newName = await vscode.window.showInputBox({
          title: vscode.l10n.t('Rename Section'),
          prompt: vscode.l10n.t('Enter new section name'),
          value: item.sectionName,
          validateInput: value => {
            const trimmed = value.trim();
            if (!trimmed) {
              return vscode.l10n.t('Section name cannot be empty.');
            }
            if (trimmed !== item.sectionName && existing.includes(trimmed)) {
              return vscode.l10n.t('Section "{0}" already exists.', trimmed);
            }
            return undefined;
          },
        });
        if (!newName) {
          return;
        }
        const trimmed = newName.trim();
        if (!trimmed || trimmed === item.sectionName) {
          return;
        }
        if (actionsManager.renameSection(item.sectionName, trimmed)) {
          refreshAll();
          vscode.window.showInformationMessage(
            vscode.l10n.t('Section renamed to "{0}".', trimmed)
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.renameAction',
      async (item: ActionItem | SettingActionItem) => {
        const newName = await vscode.window.showInputBox({
          title: vscode.l10n.t('Rename Action'),
          prompt: vscode.l10n.t('Enter new action name'),
          value: item.action.name,
          validateInput: value => {
            if (!value.trim()) {
              return vscode.l10n.t('Action name cannot be empty.');
            }
            return undefined;
          },
        });
        if (!newName) {
          return;
        }
        const trimmed = newName.trim();
        if (!trimmed || trimmed === item.action.name) {
          return;
        }

        actionsManager.updateAction({
          ...item.action,
          name: trimmed,
        });
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Action renamed to "{0}".', trimmed)
        );
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.editActionDescription',
      async (item: ActionItem | SettingActionItem) => {
        const nextDescription = await vscode.window.showInputBox({
          title: vscode.l10n.t('Edit Description'),
          prompt: vscode.l10n.t('Enter new description. Leave empty to clear.'),
          value: item.action.description ?? '',
        });
        if (nextDescription === undefined) {
          return;
        }

        const trimmed = nextDescription.trim();
        const description = trimmed || undefined;
        if (description === item.action.description) {
          return;
        }

        actionsManager.updateAction({
          ...item.action,
          description,
        });
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Description updated for action "{0}".', item.action.name)
        );
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.duplicateSection',
      async (item: SettingSectionItem) => {
        const duplicatedSectionName = actionsManager.duplicateSection(item.sectionName);
        if (!duplicatedSectionName) {
          return;
        }
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Section "{0}" duplicated.', duplicatedSectionName)
        );
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.deleteSection',
      async (item: SettingSectionItem) => {
        const answer = await vscode.window.showWarningMessage(
          vscode.l10n.t('Delete section "{0}"?', item.sectionName),
          { modal: true },
          vscode.l10n.t('Delete')
        );
        if (answer !== vscode.l10n.t('Delete')) {
          return;
        }
        if (!actionsManager.deleteSection(item.sectionName)) {
          return;
        }
        refreshAll();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Section "{0}" deleted.', item.sectionName)
        );
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.editCommonOnNewTerminalCommand',
      async (_item?: CommonOnNewTerminalCommandItem) => {
        if (!actionsManager.hasWorkspace()) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Terminal Actions: Please open a workspace folder first.')
          );
          return;
        }

        const current = actionsManager.getCommonOnNewTerminalCommand() ?? '';
        const next = await vscode.window.showInputBox({
          title: vscode.l10n.t('Common new terminal pre-command'),
          prompt: vscode.l10n.t(
            'Optional. Runs once when a new terminal is created, before action commands. Leave empty to clear.'
          ),
          value: current,
          placeHolder: vscode.l10n.t('e.g. source ~/.zshrc'),
        });
        if (next === undefined) {
          return;
        }

        actionsManager.setCommonOnNewTerminalCommand(next);
        refreshAll();
        if (next.trim()) {
          vscode.window.showInformationMessage(
            vscode.l10n.t('Common new terminal pre-command updated.')
          );
        } else {
          vscode.window.showInformationMessage(
            vscode.l10n.t('Common new terminal pre-command cleared.')
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.editNewTerminalDelaySeconds',
      async (_item?: NewTerminalDelaySecondsItem) => {
        if (!actionsManager.hasWorkspace()) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Terminal Actions: Please open a workspace folder first.')
          );
          return;
        }

        const current = actionsManager.getNewTerminalDelaySeconds();
        const input = await vscode.window.showInputBox({
          title: vscode.l10n.t('New terminal delay seconds'),
          prompt: vscode.l10n.t(
            'Seconds to wait after a new terminal is created, before running pre-commands. Leave empty to clear.'
          ),
          value: current !== undefined ? String(current) : '',
          placeHolder: vscode.l10n.t('e.g. 2'),
          validateInput: v => {
            if (v.trim() === '') {
              return undefined;
            }
            const n = Number(v.trim());
            if (!Number.isFinite(n) || n < 0) {
              return vscode.l10n.t('Enter a non-negative number.');
            }
            return undefined;
          },
        });
        if (input === undefined) {
          return;
        }

        const trimmed = input.trim();
        const seconds = trimmed === '' ? undefined : Number(trimmed);
        actionsManager.setNewTerminalDelaySeconds(seconds);
        refreshAll();
        if (seconds !== undefined && seconds > 0) {
          vscode.window.showInformationMessage(
            vscode.l10n.t('New terminal delay seconds set to {0}.', seconds)
          );
        } else {
          vscode.window.showInformationMessage(
            vscode.l10n.t('New terminal delay seconds cleared.')
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.openActionsFile',
      () => {
        if (!actionsManager.hasWorkspace() || !workspaceRoot) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Terminal Actions: Please open a workspace folder first.')
          );
          return;
        }
        const filePath = path.join(workspaceRoot, '.vscode', 'actions.json');
        void vscode.commands.executeCommand(
          'vscode.open',
          vscode.Uri.file(filePath)
        );
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.cycleSubtextModeFromCommand',
      async () => {
        await updateTreeSubtextMode(getNextTreeSubtextMode('command'));
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.cycleSubtextModeFromDescription',
      async () => {
        await updateTreeSubtextMode(getNextTreeSubtextMode('description'));
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.cycleSubtextModeFromHidden',
      async () => {
        await updateTreeSubtextMode(getNextTreeSubtextMode('hidden'));
      }
    ),

    vscode.commands.registerCommand(
      'localTerminalActions.selectTreeSubtextMode',
      async () => {
        const current = getTreeSubtextMode();
        type SubtextModeQuickPickItem = vscode.QuickPickItem & {
          mode: TreeSubtextMode;
        };
        const items: SubtextModeQuickPickItem[] = [
          {
            label: vscode.l10n.t('Show command'),
            description: current === 'command' ? vscode.l10n.t('Current') : undefined,
            mode: 'command',
          },
          {
            label: vscode.l10n.t('Show description'),
            description: current === 'description' ? vscode.l10n.t('Current') : undefined,
            mode: 'description',
          },
          {
            label: vscode.l10n.t('Hide subtext'),
            description: current === 'hidden' ? vscode.l10n.t('Current') : undefined,
            mode: 'hidden',
          },
        ];

        const selection = await new Promise<SubtextModeQuickPickItem | undefined>(
          resolve => {
            let settled = false;
            const finish = (value: SubtextModeQuickPickItem | undefined): void => {
              if (settled) {
                return;
              }
              settled = true;
              resolve(value);
            };

            const qp = vscode.window.createQuickPick<SubtextModeQuickPickItem>();
            qp.title = vscode.l10n.t('Subtext mode');
            qp.placeholder = vscode.l10n.t('Choose how subtext is shown in the tree');
            qp.items = items;

            const currentItem = items.find(item => item.mode === current);
            if (currentItem) {
              qp.activeItems = [currentItem];
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
          }
        );
        if (!selection) {
          return;
        }
        await updateTreeSubtextMode(selection.mode);
      }
    ),

    // Manually refresh both views
    vscode.commands.registerCommand('localTerminalActions.refresh', () => {
      refreshAll();
    }),

    vscode.commands.registerCommand(
      'localTerminalActions.initActionsFile',
      () => {
        if (!actionsManager.hasWorkspace()) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Terminal Actions: Please open a workspace folder first.')
          );
          return;
        }
        const result = actionsManager.initActionsFile();
        if (result === 'created') {
          refreshAll();
          vscode.window.showInformationMessage(vscode.l10n.t('actions.json created.'));
        } else if (result === 'updated') {
          refreshAll();
          vscode.window.showInformationMessage(vscode.l10n.t('actions.json updated.'));
        } else {
          vscode.window.showInformationMessage(
            vscode.l10n.t('actions.json is already up to date.')
          );
        }
      }
    )
  );
}

/**
 * 拡張を無効化します。
 */
export function deactivate(): void {
  // Nothing to clean up; VS Code disposes subscriptions automatically.
}
