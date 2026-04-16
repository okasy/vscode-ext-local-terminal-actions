import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { ActionsProvider, ActionItem } from './actionsProvider';
import {
  SettingProvider,
  SettingActionItem,
  SettingSectionItem,
} from './settingProvider';
import { TerminalManager } from './terminalManager';
import { collectActionInfo } from './inputFlows';
import { ActionExecutionStatus } from './types';

type TreeSubtextMode = 'command' | 'description' | 'hidden';

function getTreeSubtextMode(): TreeSubtextMode {
  const mode = vscode.workspace
    .getConfiguration('localTerminalActions')
    .get<string>('treeSubtextMode', 'command');
  if (mode === 'description' || mode === 'hidden') {
    return mode;
  }
  return 'command';
}

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

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const actionsManager = new ActionsManager(workspaceRoot, context.extensionPath);
  const actionsProvider = new ActionsProvider(actionsManager);
  const settingProvider = new SettingProvider(actionsManager);
  const updateActionStatus = (actionId: string, status: ActionExecutionStatus): void => {
    actionsProvider.setActionStatus(actionId, status);
  };
  const terminalManager = new TerminalManager({
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

  const settingTreeView = vscode.window.createTreeView(
    'localTerminalActions.setting',
    {
      treeDataProvider: settingProvider,
      dragAndDropController: settingProvider,
    }
  );

  const refreshAll = (): void => {
    actionsProvider.refresh();
    settingProvider.refresh();
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

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'localTerminalActions.actions',
      actionsProvider
    ),
    settingTreeView,
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

  context.subscriptions.push(
    // Run an action from the Actions view
    vscode.commands.registerCommand(
      'localTerminalActions.runAction',
      async (item: ActionItem) => {
        await terminalManager.runAction(item.action);
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
          actionsProvider.refresh();
          settingProvider.refresh();
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
          actionsProvider.refresh();
          settingProvider.refresh();
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
          actionsProvider.refresh();
          settingProvider.refresh();
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
        actionsProvider.refresh();
        settingProvider.refresh();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Action "{0}" duplicated.', duplicated.name)
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
        actionsProvider.refresh();
        settingProvider.refresh();
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
        actionsProvider.refresh();
        settingProvider.refresh();
        vscode.window.showInformationMessage(
          vscode.l10n.t('Section "{0}" deleted.', item.sectionName)
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
        const selection = await vscode.window.showQuickPick(
          [
            {
              label: vscode.l10n.t('Show command'),
              description: current === 'command' ? vscode.l10n.t('Current') : undefined,
              mode: 'command' as const,
            },
            {
              label: vscode.l10n.t('Show description'),
              description: current === 'description' ? vscode.l10n.t('Current') : undefined,
              mode: 'description' as const,
            },
            {
              label: vscode.l10n.t('Hide subtext'),
              description: current === 'hidden' ? vscode.l10n.t('Current') : undefined,
              mode: 'hidden' as const,
            },
          ],
          {
            title: vscode.l10n.t('Subtext mode'),
            placeHolder: vscode.l10n.t('Choose how subtext is shown in the tree'),
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

export function deactivate(): void {
  // Nothing to clean up; VS Code disposes subscriptions automatically.
}
