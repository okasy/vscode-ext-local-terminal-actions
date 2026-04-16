import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { ActionsProvider, ActionItem } from './actionsProvider';
import { SettingProvider, SettingActionItem } from './settingProvider';
import { TerminalManager } from './terminalManager';
import { collectActionInfo } from './inputFlows';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const actionsManager = new ActionsManager(workspaceRoot);
  const terminalManager = new TerminalManager();
  const actionsProvider = new ActionsProvider(actionsManager);
  const settingProvider = new SettingProvider(actionsManager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'localTerminalActions.actions',
      actionsProvider
    ),
    vscode.window.registerTreeDataProvider(
      'localTerminalActions.setting',
      settingProvider
    )
  );

  // ------------------------------------------------------------------
  // Watch .vscode/actions.json for external changes (e.g. git pull)
  // ------------------------------------------------------------------
  if (workspaceRoot) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, '.vscode/actions.json')
    );
    const refresh = (): void => {
      actionsProvider.refresh();
      settingProvider.refresh();
    };
    context.subscriptions.push(
      watcher,
      watcher.onDidChange(refresh),
      watcher.onDidCreate(refresh),
      watcher.onDidDelete(refresh)
    );
  }

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

    // Add a new action (triggered from Setting view title bar)
    vscode.commands.registerCommand(
      'localTerminalActions.addAction',
      async () => {
        if (!actionsManager.hasWorkspace()) {
          vscode.window.showWarningMessage(
            'Local Terminal Actions: Please open a workspace folder first.'
          );
          return;
        }
        const data = await collectActionInfo(actionsManager);
        if (data) {
          actionsManager.addAction(data);
          actionsProvider.refresh();
          settingProvider.refresh();
          vscode.window.showInformationMessage(
            `Action "${data.name}" added.`
          );
        }
      }
    ),

    // Edit an existing action (triggered from Setting view item)
    vscode.commands.registerCommand(
      'localTerminalActions.editAction',
      async (item: SettingActionItem) => {
        const data = await collectActionInfo(actionsManager, item.action);
        if (data) {
          actionsManager.updateAction({ ...data, id: item.action.id });
          actionsProvider.refresh();
          settingProvider.refresh();
          vscode.window.showInformationMessage(
            `Action "${data.name}" updated.`
          );
        }
      }
    ),

    // Delete an action (triggered from Setting view item)
    vscode.commands.registerCommand(
      'localTerminalActions.deleteAction',
      async (item: SettingActionItem) => {
        const answer = await vscode.window.showWarningMessage(
          `Delete action "${item.action.name}"?`,
          { modal: true },
          'Delete'
        );
        if (answer === 'Delete') {
          actionsManager.deleteAction(item.action.id);
          actionsProvider.refresh();
          settingProvider.refresh();
          vscode.window.showInformationMessage(
            `Action "${item.action.name}" deleted.`
          );
        }
      }
    ),

    // Manually refresh both views
    vscode.commands.registerCommand('localTerminalActions.refresh', () => {
      actionsProvider.refresh();
      settingProvider.refresh();
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up; VS Code disposes subscriptions automatically.
}
