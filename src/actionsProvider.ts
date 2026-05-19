import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action, ActionExecutionStatus } from './types';

// ---------------------------------------------------------------------------
// Tree item classes
// ---------------------------------------------------------------------------

/**
 * 現在の設定に基づいてアクション項目のサブテキストを決定します。
 */
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

/**
 * セクション単位でアクションをまとめるツリー項目です。
 */
export class SectionItem extends vscode.TreeItem {
  /**
   * Actions ツリー用のセクションノードを作成します。
   */
  constructor(public readonly sectionName: string) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'section';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * 単一のアクションを表すツリー項目です。
 */
export class ActionItem extends vscode.TreeItem {
  /**
   * 現在の実行状態に応じた UI を持つアクションノードを作成します。
   */
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

/**
 * メインの Actions ツリーを提供し、アクションごとの実行状態を保持します。
 */
export class ActionsProvider
  implements vscode.TreeDataProvider<SectionItem | ActionItem>
{
  private readonly actionStatuses = new Map<string, ActionExecutionStatus>();

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SectionItem | ActionItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * actionsManager を参照するプロバイダーを作成します。
   */
  constructor(private readonly actionsManager: ActionsManager) {}

  /**
   * ツリー表示を更新します。
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
    * アクションに表示する実行状態を更新します。
   */
  setActionStatus(actionId: string, status: ActionExecutionStatus): void {
    if (status === 'idle') {
      this.actionStatuses.delete(actionId);
    } else {
      this.actionStatuses.set(actionId, status);
    }
    this._onDidChangeTreeData.fire();
  }

  /**
    * アクションに紐づく実行状態をクリアします。
   */
  clearActionStatus(actionId: string): void {
    this.actionStatuses.delete(actionId);
    this._onDidChangeTreeData.fire();
  }

  /**
    * 指定した要素に対応するツリー項目を返します。
   */
  getTreeItem(element: SectionItem | ActionItem): vscode.TreeItem {
    return element;
  }

  /**
    * ルートではセクション、各セクション配下ではアクション項目を返します。
   */
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

/**
 * ツリー上のアクションに表示するホバーツールチップを組み立てます。
 */
function buildTooltip(action: Action, status: ActionExecutionStatus): vscode.MarkdownString {
  const lines: string[] = [`**${action.name}**`, '', `\`${action.command}\``];
  lines.push('', vscode.l10n.t('Status: {0}', getStatusLabel(status)));
  if (action.onNewTerminalCommand) {
    lines.push(
      vscode.l10n.t('New terminal pre-command: `{0}`', action.onNewTerminalCommand)
    );
  }
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

/**
 * 実行状態に対応するテーマアイコンを返します。
 */
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

/**
 * 実行状態に対応するローカライズ済みラベルを返します。
 */
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

/**
 * メニューやインラインアクションで使う context key を計算します。
 */
function getContextValue(action: Action, status: ActionExecutionStatus): string {
  if (action.confirmBeforeRun) {
    return status === 'idle' ? 'action:confirm' : 'action:confirm:executed';
  }
  return status === 'idle' ? 'action' : 'action:executed';
}
