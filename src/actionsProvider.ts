import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action, ActionExecutionStatus } from './types';

// ---------------------------------------------------------------------------
// Tree item classes
// ---------------------------------------------------------------------------

function getSubtextForAction(action: Action): string | undefined {
  const mode = vscode.workspace
    .getConfiguration('localTerminalActions')
    .get<string>('treeSubtextMode', 'command');
  switch (mode) {
    case 'description':
      return action.description;
    case 'hidden':
      return undefined;
    case 'command':
    default:
      return action.command;
  }
}

export class SectionItem extends vscode.TreeItem {
  constructor(public readonly sectionName: string) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'section';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

export class ActionItem extends vscode.TreeItem {
  constructor(
    public readonly action: Action,
    status: ActionExecutionStatus
  ) {
    super(action.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = getContextValue(action, status);
    this.description = getSubtextForAction(action);
    this.tooltip = buildTooltip(action, status);
    this.iconPath = getIconForStatus(status);
    // Idle actions run directly; executed actions focus their terminal.
    this.command = {
      command:
        status === 'idle'
          ? 'localTerminalActions.runAction'
          : 'localTerminalActions.focusActionTerminal',
      title: status === 'idle' ? vscode.l10n.t('Run') : vscode.l10n.t('Focus Terminal'),
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
  private readonly actionStatuses = new Map<string, ActionExecutionStatus>();

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SectionItem | ActionItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly actionsManager: ActionsManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setActionStatus(actionId: string, status: ActionExecutionStatus): void {
    if (status === 'idle') {
      this.actionStatuses.delete(actionId);
    } else {
      this.actionStatuses.set(actionId, status);
    }
    this._onDidChangeTreeData.fire();
  }

  clearActionStatus(actionId: string): void {
    this.actionStatuses.delete(actionId);
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
        .map(a => new ActionItem(a, this.actionStatuses.get(a.id) ?? 'idle'));
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTooltip(action: Action, status: ActionExecutionStatus): vscode.MarkdownString {
  const lines: string[] = [`**${action.name}**`, '', `\`${action.command}\``];
  lines.push('', vscode.l10n.t('Status: {0}', getStatusLabel(status)));
  if (action.terminalProfile) {
    lines.push('', vscode.l10n.t('Profile: `{0}`', action.terminalProfile));
  }
  if (action.cwd) {
    lines.push(vscode.l10n.t('Working dir: `{0}`', action.cwd));
  }
  if (action.variables && action.variables.length > 0) {
    lines.push(
      vscode.l10n.t('Variables: `{0}`', action.variables.map(v => v.name).join(', '))
    );
  }
  if (action.confirmBeforeRun) {
    lines.push(vscode.l10n.t('Confirmation: required'));
  }
  if (action.description) {
    lines.push('', action.description);
  }
  return new vscode.MarkdownString(lines.join('\n'));
}

function getIconForStatus(status: ActionExecutionStatus): vscode.ThemeIcon {
  switch (status) {
    case 'running':
      return new vscode.ThemeIcon('loading~spin');
    case 'success':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
    case 'warning':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiYellow'));
    case 'error':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiRed'));
    case 'idle':
    default:
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('disabledForeground'));
  }
}

function getStatusLabel(status: ActionExecutionStatus): string {
  switch (status) {
    case 'running':
      return vscode.l10n.t('Running');
    case 'success':
      return vscode.l10n.t('Succeeded');
    case 'warning':
      return vscode.l10n.t('Warning');
    case 'error':
      return vscode.l10n.t('Failed');
    case 'idle':
    default:
      return vscode.l10n.t('Idle');
  }
}

function getContextValue(action: Action, status: ActionExecutionStatus): string {
  if (action.confirmBeforeRun) {
    return status === 'idle' ? 'action:confirm' : 'action:confirm:executed';
  }
  return status === 'idle' ? 'action' : 'action:executed';
}
