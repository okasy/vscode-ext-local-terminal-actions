import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action } from './types';

// ---------------------------------------------------------------------------
// Tree item classes
// ---------------------------------------------------------------------------

export class SectionItem extends vscode.TreeItem {
  constructor(public readonly sectionName: string) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'section';
    this.iconPath = new vscode.ThemeIcon('list-tree');
  }
}

export class ActionItem extends vscode.TreeItem {
  constructor(public readonly action: Action) {
    super(action.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'action';
    this.description = action.command;
    this.tooltip = buildTooltip(action);
    this.iconPath = new vscode.ThemeIcon('terminal');
    // Clicking the item runs the action directly
    this.command = {
      command: 'localTerminalActions.runAction',
      title: 'Run',
      arguments: [this],
    };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ActionsProvider
  implements vscode.TreeDataProvider<SectionItem | ActionItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SectionItem | ActionItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly actionsManager: ActionsManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SectionItem | ActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: SectionItem | ActionItem
  ): vscode.ProviderResult<(SectionItem | ActionItem)[]> {
    if (!this.actionsManager.hasWorkspace()) {
      return [];
    }
    if (!element) {
      return this.actionsManager.getSections().map(s => new SectionItem(s));
    }
    if (element instanceof SectionItem) {
      return this.actionsManager
        .getActionsBySection(element.sectionName)
        .map(a => new ActionItem(a));
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
  if (action.description) {
    lines.push('', action.description);
  }
  return new vscode.MarkdownString(lines.join('\n'));
}
