import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action } from './types';

// ---------------------------------------------------------------------------
// Tree item classes
// ---------------------------------------------------------------------------

export class SettingSectionItem extends vscode.TreeItem {
  constructor(public readonly sectionName: string) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'section';
    this.iconPath = new vscode.ThemeIcon('list-tree');
  }
}

export class SettingActionItem extends vscode.TreeItem {
  constructor(public readonly action: Action) {
    super(action.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'action';
    this.description = action.command;
    this.tooltip = buildTooltip(action);
    this.iconPath = new vscode.ThemeIcon('symbol-event');
    // Clicking the item in the Setting view opens the edit wizard
    this.command = {
      command: 'localTerminalActions.editAction',
      title: 'Edit',
      arguments: [this],
    };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SettingProvider
  implements vscode.TreeDataProvider<SettingSectionItem | SettingActionItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SettingSectionItem | SettingActionItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly actionsManager: ActionsManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(
    element: SettingSectionItem | SettingActionItem
  ): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: SettingSectionItem | SettingActionItem
  ): vscode.ProviderResult<(SettingSectionItem | SettingActionItem)[]> {
    if (!this.actionsManager.hasWorkspace()) {
      return [];
    }
    if (!element) {
      return this.actionsManager
        .getSections()
        .map(s => new SettingSectionItem(s));
    }
    if (element instanceof SettingSectionItem) {
      return this.actionsManager
        .getActionsBySection(element.sectionName)
        .map(a => new SettingActionItem(a));
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTooltip(action: Action): vscode.MarkdownString {
  const lines: string[] = [`**${action.name}**`, '', `\`${action.command}\``];
  if (action.terminalProfile) {
    lines.push('', `Profile: \`${action.terminalProfile}\``);
  }
  if (action.cwd) {
    lines.push(`Working dir: \`${action.cwd}\``);
  }
  if (action.reuseTerminal === false) {
    lines.push('', '_Always creates a new terminal_');
  }
  if (action.description) {
    lines.push('', action.description);
  }
  return new vscode.MarkdownString(lines.join('\n'));
}
