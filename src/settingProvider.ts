import * as vscode from 'vscode';
import { ActionsManager } from './actionsManager';
import { Action } from './types';

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

export class SettingSectionItem extends vscode.TreeItem {
  constructor(
    public readonly sectionName: string,
    position: 'single' | 'top' | 'middle' | 'bottom'
  ) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `section:${position}`;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

export class SubtextModeSelectorItem extends vscode.TreeItem {
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

export class GeneralSettingCategoryItem extends vscode.TreeItem {
  constructor(public readonly category: GeneralSettingCategory) {
    super(getGeneralSettingCategoryLabel(category), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `generalCategory:${category}`;
    this.iconPath = new vscode.ThemeIcon(getGeneralSettingCategoryIcon(category));
  }
}

export class NewTerminalDelaySecondsItem extends vscode.TreeItem {
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

export class CommonOnNewTerminalCommandItem extends vscode.TreeItem {
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

export class InitActionsFileItem extends vscode.TreeItem {
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

export class OpenActionsFileItem extends vscode.TreeItem {
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

export class SettingActionItem extends vscode.TreeItem {
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

  constructor(
    private readonly actionsManager: ActionsManager,
    private readonly viewKind: 'general' | 'editActions'
  ) {}

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

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(
    element: GeneralSettingCategoryItem | SubtextModeSelectorItem | InitActionsFileItem | OpenActionsFileItem | SettingSectionItem | SettingActionItem | CommonOnNewTerminalCommandItem | NewTerminalDelaySecondsItem
  ): vscode.TreeItem {
    return element;
  }

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
