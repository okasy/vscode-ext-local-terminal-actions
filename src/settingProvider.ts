import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action } from './types';

type TreeSubtextMode = 'command' | 'description' | 'hidden';

/**
 * ツリー項目に適用するサブテキスト表示モードを返します。
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
 * サブテキスト表示モードのローカライズ済みラベルを返します。
 */
function getSubtextModeLabel(mode: TreeSubtextMode): string {
  switch (mode) {
    case 'description':
      return vscode.l10n.t('Show description');
    case 'hidden':
      return vscode.l10n.t('Hide subtext');
    case 'command':
    default:
      return vscode.l10n.t('Show command');
  }
}

// ---------------------------------------------------------------------------
// Tree item classes
// ---------------------------------------------------------------------------

/**
 * 設定ツリー内のアクションに表示するサブテキストを決定します。
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
 * edit-actions ビュー内のセクションを表すツリー項目です。
 */
export class SettingSectionItem extends vscode.TreeItem {
  /**
   * メニュー制御用の位置情報を持つセクションノードを作成します。
   */
  constructor(
    public readonly sectionName: string,
    position: 'single' | 'top' | 'middle' | 'bottom'
  ) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `section:${position}`;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * サブテキスト表示モード選択を開くツリー項目です。
 */
export class SubtextModeSelectorItem extends vscode.TreeItem {
  /**
   * 表示設定用の選択項目を作成します。
   */
  constructor() {
    const mode = getTreeSubtextMode();
    super(
      vscode.l10n.t('Subtext mode: {0}', getSubtextModeLabel(mode)),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'subtextModeSelector';
    this.iconPath = new vscode.ThemeIcon('list-selection');
    this.description = vscode.l10n.t('Change');
    this.command = {
      command: 'localTerminalActions.selectTreeSubtextMode',
      title: vscode.l10n.t('Change subtext mode'),
    };
    this.tooltip = vscode.l10n.t('Select how subtext is shown in the tree');
  }
}

type GeneralSettingCategory = 'display' | 'behavior' | 'file';

/**
 * 一般設定をカテゴリ単位でまとめるツリー項目です。
 */
export class GeneralSettingCategoryItem extends vscode.TreeItem {
  /**
   * 一般設定ツリー内のカテゴリノードを作成します。
   */
  constructor(public readonly category: GeneralSettingCategory) {
    super(getGeneralSettingCategoryLabel(category), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `generalCategory:${category}`;
    this.iconPath = new vscode.ThemeIcon(getGeneralSettingCategoryIcon(category));
  }
}

/**
 * 新規ターミナルの事前コマンド遅延秒数を編集するツリー項目です。
 */
export class NewTerminalDelaySecondsItem extends vscode.TreeItem {
  /**
   * 新規ターミナル遅延設定の項目を作成します。
   */
  constructor(value: number | undefined) {
    super(
      vscode.l10n.t('New terminal delay seconds'),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'newTerminalDelaySeconds';
    this.iconPath = new vscode.ThemeIcon('watch');
    this.description =
      value !== undefined && value > 0 ? String(value) : vscode.l10n.t('Not set');
    this.command = {
      command: 'localTerminalActions.editNewTerminalDelaySeconds',
      title: vscode.l10n.t('Edit new terminal delay seconds'),
      arguments: [this],
    };
    this.tooltip = vscode.l10n.t(
      'Seconds to wait after a new terminal is created, before running pre-commands'
    );
  }
}

/**
 * 新規ターミナル共通事前コマンドを編集するツリー項目です。
 */
export class CommonOnNewTerminalCommandItem extends vscode.TreeItem {
  /**
   * 共通事前コマンド設定の項目を作成します。
   */
  constructor(value: string | undefined) {
    super(
      vscode.l10n.t('Common new terminal pre-command'),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'commonOnNewTerminalCommand';
    this.iconPath = new vscode.ThemeIcon('terminal-bash');
    this.description = value ? value : vscode.l10n.t('Not set');
    this.command = {
      command: 'localTerminalActions.editCommonOnNewTerminalCommand',
      title: vscode.l10n.t('Edit common new terminal pre-command'),
      arguments: [this],
    };
    this.tooltip = vscode.l10n.t(
      'Command executed once right after creating a new terminal, before action commands'
    );
  }
}

/**
 * actions.json の作成または不足項目補完を行うツリー項目です。
 */
export class InitActionsFileItem extends vscode.TreeItem {
  /**
   * 設定ファイル初期化用のツリー項目を作成します。
   */
  constructor() {
    super(
      vscode.l10n.t('Create / adjust settings file'),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'initActionsFile';
    this.iconPath = new vscode.ThemeIcon('file-add');
    this.command = {
      command: 'localTerminalActions.initActionsFile',
      title: vscode.l10n.t('Create / adjust settings file'),
    };
    this.tooltip = vscode.l10n.t(
      'Create actions.json with the minimal structure, or add missing fields to an existing file'
    );
  }
}

/**
 * actions.json をエディタで開くツリー項目です。
 */
export class OpenActionsFileItem extends vscode.TreeItem {
  /**
   * 設定ファイルを開くツリー項目を作成します。
   */
  constructor() {
    super(
      vscode.l10n.t('Open actions.json'),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'openActionsFile';
    this.iconPath = new vscode.ThemeIcon('go-to-file');
    this.command = {
      command: 'localTerminalActions.openActionsFile',
      title: vscode.l10n.t('Open actions.json'),
    };
    this.tooltip = vscode.l10n.t('Open .vscode/actions.json in the editor');
  }
}

/**
 * 編集可能な単一アクションを表すツリー項目です。
 */
export class SettingActionItem extends vscode.TreeItem {
  /**
   * 設定ツリー用のアクションノードを作成します。
   */
  constructor(
    public readonly action: Action,
    position: 'single' | 'top' | 'middle' | 'bottom'
  ) {
    super(action.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `action:${position}`;
    this.description = getSubtextForAction(action);
    this.tooltip = buildTooltip(action);
    this.iconPath = new vscode.ThemeIcon('symbol-event');
    // Clicking the item in the Setting view opens the edit wizard
    this.command = {
      command: 'localTerminalActions.editAction',
      title: vscode.l10n.t('Edit'),
      arguments: [this],
    };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * 一般設定ビューと edit-actions ビューを提供します。
 */
export class SettingProvider
  implements
    vscode.TreeDataProvider<
      GeneralSettingCategoryItem | SubtextModeSelectorItem | CommonOnNewTerminalCommandItem | NewTerminalDelaySecondsItem | InitActionsFileItem | OpenActionsFileItem | SettingSectionItem | SettingActionItem
    >,
    vscode.TreeDragAndDropController<
      GeneralSettingCategoryItem | SubtextModeSelectorItem | CommonOnNewTerminalCommandItem | NewTerminalDelaySecondsItem | InitActionsFileItem | OpenActionsFileItem | SettingSectionItem | SettingActionItem
    >
{
  readonly dragMimeTypes = ['application/vnd.code.tree.localTerminalActions.settingEditActions'];
  readonly dropMimeTypes = ['application/vnd.code.tree.localTerminalActions.settingEditActions'];

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    | GeneralSettingCategoryItem
    | SubtextModeSelectorItem
    | CommonOnNewTerminalCommandItem
    | NewTerminalDelaySecondsItem
    | SettingSectionItem
    | SettingActionItem
    | InitActionsFileItem
    | OpenActionsFileItem
    | undefined
    | null
    | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * 一般設定ツリーまたは edit-actions ツリー用のプロバイダーを作成します。
   */
  constructor(
    private readonly actionsManager: ActionsManager,
    private readonly viewKind: 'general' | 'editActions'
  ) {}

  /**
   * セクションやアクションのドラッグ情報をシリアライズします。
   */
  async handleDrag(
    source: readonly (
      | InitActionsFileItem
      | OpenActionsFileItem
      | GeneralSettingCategoryItem
      | SubtextModeSelectorItem
      | CommonOnNewTerminalCommandItem
      | SettingSectionItem
      | SettingActionItem
    )[],

    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    if (source.length !== 1) {
      return;
    }
    const item = source[0];
    if (item instanceof SettingSectionItem) {
      dataTransfer.set(
        this.dragMimeTypes[0],
        new vscode.DataTransferItem(
          JSON.stringify({ kind: 'section', sectionName: item.sectionName })
        )
      );
      return;
    }
    if (item instanceof SettingActionItem) {
      dataTransfer.set(
        this.dragMimeTypes[0],
        new vscode.DataTransferItem(
          JSON.stringify({ kind: 'action', actionId: item.action.id })
        )
      );
    }
  }

  /**
   * セクションとアクションのドラッグアンドドロップ並び替えを適用します。
   */
  async handleDrop(
    target:
      | InitActionsFileItem
      | OpenActionsFileItem
      | GeneralSettingCategoryItem
      | SubtextModeSelectorItem
      | CommonOnNewTerminalCommandItem
      | SettingSectionItem
      | SettingActionItem
      | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    if (!target) {
      return;
    }
    const item = dataTransfer.get(this.dragMimeTypes[0]);
    if (!item) {
      return;
    }

    let moved = false;
    const raw = await item.asString();
    const payload = JSON.parse(raw) as
      | { kind: 'section'; sectionName: string }
      | { kind: 'action'; actionId: string };

    if (payload.kind === 'section' && target instanceof SettingSectionItem) {
      moved = this.actionsManager.moveSectionBefore(
        payload.sectionName,
        target.sectionName
      );
    }

    if (payload.kind === 'action' && target instanceof SettingActionItem) {
      moved = this.actionsManager.moveActionBeforeInSection(
        payload.actionId,
        target.action.id
      );
    }

    if (payload.kind === 'action' && target instanceof SettingSectionItem) {
      moved = this.actionsManager.moveActionToSectionEnd(
        payload.actionId,
        target.sectionName
      );
    }

    if (moved) {
      this.refresh();
    }
  }

  /**
   * 対象ツリー表示を更新します。
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 指定要素に対応するツリー項目を返します。
   */
  getTreeItem(
    element: GeneralSettingCategoryItem | SubtextModeSelectorItem | InitActionsFileItem | OpenActionsFileItem | SettingSectionItem | SettingActionItem | CommonOnNewTerminalCommandItem | NewTerminalDelaySecondsItem
  ): vscode.TreeItem {
    return element;
  }

  /**
   * 現在の設定ビューに応じてカテゴリ、セクション、アクションの子要素を返します。
   */
  getChildren(
    element?: GeneralSettingCategoryItem | SubtextModeSelectorItem | InitActionsFileItem | OpenActionsFileItem | SettingSectionItem | SettingActionItem | CommonOnNewTerminalCommandItem | NewTerminalDelaySecondsItem
  ): vscode.ProviderResult<
    (GeneralSettingCategoryItem | SubtextModeSelectorItem | InitActionsFileItem | OpenActionsFileItem | SettingSectionItem | SettingActionItem | CommonOnNewTerminalCommandItem | NewTerminalDelaySecondsItem)[]
  > {
    if (!this.actionsManager.hasWorkspace()) {
      return [];
    }
    if (!element) {
      if (this.viewKind === 'general') {
        return [
          new GeneralSettingCategoryItem('display'),
          new GeneralSettingCategoryItem('behavior'),
          new GeneralSettingCategoryItem('file'),
        ];
      }
      const sections = this.actionsManager.getSections();
      return sections.map((name, index) => {
        const isFirst = index === 0;
        const isLast = index === sections.length - 1;
        const position =
          sections.length === 1
            ? 'single'
            : isFirst
            ? 'top'
            : isLast
            ? 'bottom'
            : 'middle';
        return new SettingSectionItem(name, position);
      });
    }
    if (element instanceof GeneralSettingCategoryItem) {
      if (element.category === 'display') {
        return [new SubtextModeSelectorItem()];
      }
      if (element.category === 'behavior') {
        return [
          new NewTerminalDelaySecondsItem(
            this.actionsManager.getNewTerminalDelaySeconds()
          ),
          new CommonOnNewTerminalCommandItem(
            this.actionsManager.getCommonOnNewTerminalCommand()
          ),
        ];
      }
      return [new InitActionsFileItem(), new OpenActionsFileItem()];
    }
    if (element instanceof SettingSectionItem) {
      const sectionActions = this.actionsManager.getActionsBySection(
        element.sectionName
      );
      return sectionActions.map((action, index) => {
        const isFirst = index === 0;
        const isLast = index === sectionActions.length - 1;
        const position =
          sectionActions.length === 1
            ? 'single'
            : isFirst
            ? 'top'
            : isLast
            ? 'bottom'
            : 'middle';
        return new SettingActionItem(action, position);
      });
    }
    return [];
  }
}

/**
 * 一般設定カテゴリのローカライズ済みラベルを返します。
 */
function getGeneralSettingCategoryLabel(category: GeneralSettingCategory): string {
  switch (category) {
    case 'display':
      return vscode.l10n.t('Display');
    case 'behavior':
      return vscode.l10n.t('Behavior');
    case 'file':
    default:
      return vscode.l10n.t('File');
  }
}

/**
 * 一般設定カテゴリで使用する codicon 名を返します。
 */
function getGeneralSettingCategoryIcon(category: GeneralSettingCategory): string {
  switch (category) {
    case 'display':
      return 'eye';
    case 'behavior':
      return 'gear';
    case 'file':
    default:
      return 'file';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 編集用アクション項目に表示するホバーツールチップを組み立てます。
 */
function buildTooltip(action: Action): vscode.MarkdownString {
  const lines: string[] = [`**${action.name}**`, '', `\`${action.command}\``];
  if (action.onNewTerminalCommand) {
    lines.push(
      '',
      vscode.l10n.t('New terminal pre-command: `{0}`', action.onNewTerminalCommand)
    );
  }
  if (action.terminalProfile) {
    lines.push('', vscode.l10n.t('Profile: `{0}`', action.terminalProfile));
  }
  if (action.cwd) {
    lines.push(vscode.l10n.t('Working dir: `{0}`', action.cwd));
  }
  if (action.reuseTerminal === false) {
    lines.push('', vscode.l10n.t('_Always creates a new terminal_'));
  }
  if (action.description) {
    lines.push('', action.description);
  }
  return new vscode.MarkdownString(lines.join('\n'));
}
