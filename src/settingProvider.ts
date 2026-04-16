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
    this.iconPath = new vscode.ThemeIcon('list-tree');
  }
}

export class SettingGroupItem extends vscode.TreeItem {
  constructor(public readonly groupKey: 'general' | 'editActions') {
    super(
      groupKey === 'general'
        ? vscode.l10n.t('General')
        : vscode.l10n.t('Edit Actions (drag and drop to reorder)'),
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue = `settingGroup:${groupKey}`;
    this.iconPath = new vscode.ThemeIcon(
      groupKey === 'general' ? 'settings-gear' : 'edit'
    );
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
      SettingGroupItem | SubtextModeSelectorItem | InitActionsFileItem | SettingSectionItem | SettingActionItem
    >,
    vscode.TreeDragAndDropController<
      SettingGroupItem | SubtextModeSelectorItem | InitActionsFileItem | SettingSectionItem | SettingActionItem
    >
{
  readonly dragMimeTypes = ['application/vnd.code.tree.localTerminalActions.setting'];
  readonly dropMimeTypes = ['application/vnd.code.tree.localTerminalActions.setting'];

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    | SettingGroupItem
    | SubtextModeSelectorItem
    | SettingSectionItem
    | SettingActionItem
      | InitActionsFileItem
    | undefined
    | null
    | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly actionsManager: ActionsManager) {}

  async handleDrag(
    source: readonly (
        | InitActionsFileItem
      | SettingGroupItem
      | SubtextModeSelectorItem
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
      | SettingGroupItem
      | SubtextModeSelectorItem
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
    element: SettingGroupItem | SubtextModeSelectorItem | InitActionsFileItem | SettingSectionItem | SettingActionItem
  ): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: SettingGroupItem | SubtextModeSelectorItem | InitActionsFileItem | SettingSectionItem | SettingActionItem
  ): vscode.ProviderResult<
    (SettingGroupItem | SubtextModeSelectorItem | InitActionsFileItem | SettingSectionItem | SettingActionItem)[]
  > {
    if (!this.actionsManager.hasWorkspace()) {
      return [];
    }
    if (!element) {
      return [
        new SettingGroupItem('general'),
        new SettingGroupItem('editActions'),
      ];
    }
    if (element instanceof SettingGroupItem) {
      if (element.groupKey === 'general') {
        return [new SubtextModeSelectorItem(), new InitActionsFileItem()];
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTooltip(action: Action): vscode.MarkdownString {
  const lines: string[] = [`**${action.name}**`, '', `\`${action.command}\``];
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
