import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Action, ActionsData } from './types';

/**
 * 新しいアクション用の軽量な一意識別子を生成します。
 */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 読み込んだ識別子をそのまま再利用できるかどうかを返します。
 */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 既存の数値サフィックス規則に従って複製時のアクション名を生成します。
 */
function getDuplicatedActionName(name: string): string {
  const match = name.match(/^(.*?)(?:\s*\((\d+)\))$/);
  if (!match) {
    return `${name} (2)`;
  }

  const base = match[1];
  const current = Number.parseInt(match[2], 10);
  if (Number.isNaN(current)) {
    return `${name} (2)`;
  }
  return `${base} (${current + 1})`;
}

/**
 * 次に利用可能な複製用セクション名を生成します。
 */
function getDuplicatedSectionName(name: string, existingSections: string[]): string {
  const used = new Set(existingSections);
  const match = name.match(/^(.*?)(?:\s*\((\d+)\))$/);

  const base = match ? match[1] : name;
  let current = match ? Number.parseInt(match[2], 10) : 1;
  if (Number.isNaN(current) || current < 1) {
    current = 1;
  }

  let candidate = `${base} (${current + 1})`;
  while (used.has(candidate)) {
    current += 1;
    candidate = `${base} (${current + 1})`;
  }

  return candidate;
}

/**
 * Manages reading and writing of .vscode/actions.json.
 */
export class ActionsManager {
  private readonly actionsFilePath: string | undefined;
  private readonly schemaSourcePath: string | undefined;

  /**
   * 現在のワークスペース向け ActionsManager を作成します。
   */
  constructor(workspaceRoot: string | undefined, extensionPath?: string) {
    if (workspaceRoot) {
      this.actionsFilePath = path.join(workspaceRoot, '.vscode', 'actions.json');
    }
    if (extensionPath) {
      this.schemaSourcePath = path.join(extensionPath, 'schemas', 'actions.schema.json');
    }
  }

  /**
   * この拡張が操作対象のワークスペースフォルダーを持つかどうかを返します。
   */
  hasWorkspace(): boolean {
    return this.actionsFilePath !== undefined;
  }

  /**
   * アクション一覧から、初出順を保ったままセクション順を導出します。
   */
  private deriveSectionsFromActions(actions: Action[]): string[] {
    const seen = new Set<string>();
    const sections: string[] = [];
    for (const action of actions) {
      if (!seen.has(action.section)) {
        seen.add(action.section);
        sections.push(action.section);
      }
    }
    return sections;
  }

  /**
   * 保存済みのセクション順を現在のアクション構成に合わせて正規化します。
   */
  private normalizeSections(
    sections: string[] | undefined,
    actions: Action[]
  ): string[] {
    const actionSections = this.deriveSectionsFromActions(actions);
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const section of sections ?? []) {
      if (!section || seen.has(section)) {
        continue;
      }
      if (actionSections.includes(section)) {
        normalized.push(section);
        seen.add(section);
      }
    }

    for (const section of actionSections) {
      if (!seen.has(section)) {
        normalized.push(section);
        seen.add(section);
      }
    }

    return normalized;
  }

  /**
   * セクション配列の順序に従って actions を並び替えます。
   * 同一セクション内の相対順序は維持し、未登録セクションは末尾へ残します。
   */
  private sortActionsBySectionOrder(
    actions: Action[],
    sections: string[] | undefined
  ): Action[] {
    const sectionOrder = new Map<string, number>();
    for (const [index, section] of (sections ?? []).entries()) {
      sectionOrder.set(section, index);
    }

    return actions
      .map((action, index) => ({ action, index }))
      .sort((left, right) => {
        const leftOrder = sectionOrder.get(left.action.section);
        const rightOrder = sectionOrder.get(right.action.section);

        if (leftOrder === undefined && rightOrder === undefined) {
          return left.index - right.index;
        }
        if (leftOrder === undefined) {
          return 1;
        }
        if (rightOrder === undefined) {
          return -1;
        }
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.index - right.index;
      })
      .map(entry => entry.action);
  }

  /**
   * 設定ファイル調整コマンド向けにトップレベルキー順と actions 順を正規化します。
   */
  private buildCanonicalInitFileData(raw: Record<string, unknown>): Record<string, unknown> {
    const sections = Array.isArray(raw.sections)
      ? raw.sections.filter((section): section is string => typeof section === 'string')
      : [];
    const actions = Array.isArray(raw.actions) ? (raw.actions as Action[]) : [];

    const canonical: Record<string, unknown> = {
      $schema:
        typeof raw.$schema === 'string' && raw.$schema.trim().length > 0
          ? raw.$schema
          : './actions.schema.json',
      sections,
      actions: this.sortActionsBySectionOrder(actions, sections),
    };

    for (const key of Object.keys(raw)) {
      if (key === '$schema' || key === 'sections' || key === 'actions') {
        continue;
      }
      canonical[key] = raw[key];
    }

    return canonical;
  }

  /**
   * actions.json を読み込み、不足時の既定値を補った正規化済みデータを返します。
   */
  private getData(): ActionsData {
    if (!this.actionsFilePath || !fs.existsSync(this.actionsFilePath)) {
      return {
        actions: [],
        sections: [],
        commonOnNewTerminalCommand: undefined,
        newTerminalDelaySeconds: undefined,
      };
    }
    try {
      const content = fs.readFileSync(this.actionsFilePath, 'utf-8');
      const rawData = JSON.parse(content) as Partial<ActionsData>;
      const rawActions = Array.isArray(rawData.actions) ? rawData.actions : [];
      const { actions, changed } = this.normalizeActionIds(rawActions);
      const sections = this.normalizeSections(
        Array.isArray(rawData.sections) ? rawData.sections : undefined,
        actions
      );
      const commonOnNewTerminalCommand =
        typeof rawData.commonOnNewTerminalCommand === 'string'
          ? rawData.commonOnNewTerminalCommand.trim() || undefined
          : undefined;
      const newTerminalDelaySeconds =
        typeof rawData.newTerminalDelaySeconds === 'number' &&
        Number.isFinite(rawData.newTerminalDelaySeconds) &&
        rawData.newTerminalDelaySeconds > 0
          ? rawData.newTerminalDelaySeconds
          : undefined;
      const normalized: ActionsData = {
        actions,
        sections,
        commonOnNewTerminalCommand,
        newTerminalDelaySeconds,
      };
      if (changed) {
        this.writeDataFile(normalized);
      }
      return normalized;
    } catch (err) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Terminal Actions: Failed to read actions.json - {0}', String(err))
      );
      return {
        actions: [],
        sections: [],
        commonOnNewTerminalCommand: undefined,
        newTerminalDelaySeconds: undefined,
      };
    }
  }

  /**
   * 設定済みの全アクションを返します。
   */
  getActions(): Action[] {
    return this.getData().actions;
  }

  /**
   * ツリー表示で使用する順序付きセクション一覧を返します。
   */
  getSections(): string[] {
    return this.getData().sections ?? [];
  }

  /**
   * 指定したセクションに属する全アクションを返します。
   */
  getActionsBySection(section: string): Action[] {
    return this.getActions().filter(a => a.section === section);
  }

  /**
   * 新規ターミナル作成時に実行する共通事前コマンドを返します。
   */
  getCommonOnNewTerminalCommand(): string | undefined {
    return this.getData().commonOnNewTerminalCommand;
  }

  /**
   * 新規ターミナル作成時の共通事前コマンドを保存します。
   */
  setCommonOnNewTerminalCommand(command: string | undefined): void {
    const data = this.getData();
    data.commonOnNewTerminalCommand = command?.trim() || undefined;
    this.saveData(data);
  }

  /**
    * 新しく作成したターミナルで commonOnNewTerminalCommand / onNewTerminalCommand を
    * 実行する前に待機する設定秒数を返します。
   */
  getNewTerminalDelaySeconds(): number | undefined {
    return this.getData().newTerminalDelaySeconds;
  }

  /**
    * 待機秒数の設定を actions.json に保存します。
    * undefined または 0 を渡すと設定を解除します。
   */
  setNewTerminalDelaySeconds(seconds: number | undefined): void {
    const data = this.getData();
    data.newTerminalDelaySeconds =
      seconds !== undefined && seconds > 0 ? seconds : undefined;
    this.saveData(data);
  }

  /**
   * 正規化済みデータを actions.json に書き戻します。
   */
  private saveData(data: ActionsData): void {
    if (!this.actionsFilePath) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Terminal Actions: No workspace folder open. Please open a folder first.')
      );
      return;
    }
    this.writeDataFile({
      actions: data.actions,
      sections: this.normalizeSections(data.sections, data.actions),
      commonOnNewTerminalCommand: data.commonOnNewTerminalCommand,
      newTerminalDelaySeconds: data.newTerminalDelaySeconds,
    });
  }

  /**
   * バンドル済みスキーマファイルをワークスペースの設定ディレクトリへコピーします。
   */
  private copySchemaFile(dir: string): void {
    if (this.schemaSourcePath && fs.existsSync(this.schemaSourcePath)) {
      const schemaDest = path.join(dir, 'actions.schema.json');
      fs.copyFileSync(this.schemaSourcePath, schemaDest);
    }
  }

  /**
   * スキーマ参照を含む actions データ全体を書き込みます。
   */
  private writeDataFile(data: ActionsData): void {
    if (!this.actionsFilePath) {
      return;
    }
    const dir = path.dirname(this.actionsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // スキーマファイルを .vscode/ にコピーして $schema フィールドを付与する
    this.copySchemaFile(dir);

    const output = { $schema: './actions.schema.json', ...data };
    fs.writeFileSync(this.actionsFilePath, JSON.stringify(output, null, 2), 'utf-8');
  }

  /**
   * すべてのアクションが空でない一意 ID を持つように補正します。
   */
  private normalizeActionIds(actions: Action[]): { actions: Action[]; changed: boolean } {
    const usedIds = new Set<string>();
    let changed = false;

    const normalized = actions.map(action => {
      let nextId = isValidId(action.id) ? action.id : '';
      if (!nextId || usedIds.has(nextId)) {
        changed = true;
        do {
          nextId = generateId();
        } while (usedIds.has(nextId));
      }
      usedIds.add(nextId);

      if (nextId !== action.id) {
        return { ...action, id: nextId };
      }
      return action;
    });

    return { actions: normalized, changed };
  }

  /**
   * 新しいアクションを追加し、生成済み ID を含む保存後の値を返します。
   */
  addAction(action: Omit<Action, 'id'>): Action {
    const data = this.getData();
    const usedIds = new Set(data.actions.map(a => a.id));
    let id = generateId();
    while (usedIds.has(id)) {
      id = generateId();
    }

    const newAction: Action = { ...action, id };
    data.actions.push(newAction);
    if (!data.sections?.includes(newAction.section)) {
      data.sections = [...(data.sections ?? []), newAction.section];
    }
    this.saveData(data);
    return newAction;
  }

  /**
   * 既存アクションを更新内容で置き換えます。
   */
  updateAction(action: Action): void {
    const data = this.getData();
    const index = data.actions.findIndex(a => a.id === action.id);
    if (index >= 0) {
      const previousSection = data.actions[index].section;
      data.actions[index] = action;

      if (!data.sections?.includes(action.section)) {
        data.sections = [...(data.sections ?? []), action.section];
      }

      if (
        previousSection !== action.section &&
        !data.actions.some(a => a.section === previousSection)
      ) {
        data.sections = (data.sections ?? []).filter(s => s !== previousSection);
      }

      this.saveData(data);
    }
  }

  /**
   * ID を指定してアクションを削除します。
   */
  deleteAction(id: string): void {
    const data = this.getData();
    data.actions = data.actions.filter(a => a.id !== id);
    this.saveData(data);
  }

  /**
    * セクションと、その配下に含まれる全アクションを削除します。
   */
  deleteSection(sectionName: string): boolean {
    const data = this.getData();
    const hasSection = (data.sections ?? []).includes(sectionName);
    const hasActions = data.actions.some(a => a.section === sectionName);
    if (!hasSection && !hasActions) {
      return false;
    }

    const nextActions = data.actions.filter(a => a.section !== sectionName);
    const nextSections = (data.sections ?? []).filter(s => s !== sectionName);

    this.saveData({
      actions: nextActions,
      sections: nextSections,
    });
    return true;
  }

  /**
   * セクションを 1 つ上または下へ移動します。
   */
  moveSection(section: string, direction: 'up' | 'down'): boolean {
    const data = this.getData();
    if (data.actions.length === 0) {
      return false;
    }

    const sections = data.sections ?? [];
    const currentIndex = sections.indexOf(section);
    if (currentIndex < 0) {
      return false;
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) {
      return false;
    }

    const nextSections = [...sections];
    [nextSections[currentIndex], nextSections[targetIndex]] = [
      nextSections[targetIndex],
      nextSections[currentIndex],
    ];

    this.saveData({
      actions: data.actions,
      sections: nextSections,
    });
    return true;
  }

  /**
   * セクションを別のセクションの直前へ移動します。
   */
  moveSectionBefore(sourceSection: string, targetSection: string): boolean {
    if (sourceSection === targetSection) {
      return false;
    }

    const data = this.getData();
    const sections = [...(data.sections ?? [])];
    const sourceIndex = sections.indexOf(sourceSection);
    const targetIndex = sections.indexOf(targetSection);
    if (sourceIndex < 0 || targetIndex < 0) {
      return false;
    }

    const [moved] = sections.splice(sourceIndex, 1);
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    sections.splice(adjustedTargetIndex, 0, moved);

    this.saveData({
      actions: data.actions,
      sections,
    });
    return true;
  }

  /**
   * 現在のセクション内でアクション順を入れ替えます。
   */
  moveActionInSection(actionId: string, direction: 'up' | 'down'): boolean {
    const data = this.getData();
    const currentIndex = data.actions.findIndex(a => a.id === actionId);
    if (currentIndex < 0) {
      return false;
    }

    const sectionName = data.actions[currentIndex].section;
    const sectionActionIndexes: number[] = [];
    for (let i = 0; i < data.actions.length; i += 1) {
      if (data.actions[i].section === sectionName) {
        sectionActionIndexes.push(i);
      }
    }

    const sectionPosition = sectionActionIndexes.indexOf(currentIndex);
    if (sectionPosition < 0) {
      return false;
    }

    const targetSectionPosition =
      direction === 'up' ? sectionPosition - 1 : sectionPosition + 1;
    if (
      targetSectionPosition < 0 ||
      targetSectionPosition >= sectionActionIndexes.length
    ) {
      return false;
    }

    const targetIndex = sectionActionIndexes[targetSectionPosition];
    const nextActions = [...data.actions];
    [nextActions[currentIndex], nextActions[targetIndex]] = [
      nextActions[targetIndex],
      nextActions[currentIndex],
    ];

    this.saveData({
      actions: nextActions,
      sections: data.sections,
    });
    return true;
  }

  /**
   * アクションを対象セクション内の別アクション直前へ移動します。
   */
  moveActionBeforeInSection(sourceActionId: string, targetActionId: string): boolean {
    if (sourceActionId === targetActionId) {
      return false;
    }

    const data = this.getData();
    const source = data.actions.find(a => a.id === sourceActionId);
    const target = data.actions.find(a => a.id === targetActionId);
    if (!source || !target) {
      return false;
    }

    const remaining = data.actions.filter(a => a.id !== sourceActionId);
    const targetIndex = remaining.findIndex(a => a.id === targetActionId);
    if (targetIndex < 0) {
      return false;
    }

    const movedAction: Action = { ...source, section: target.section };
    const nextActions = [...remaining];
    nextActions.splice(targetIndex, 0, movedAction);

    this.saveData({
      actions: nextActions,
      sections: data.sections,
    });
    return true;
  }

  /**
   * アクションを別セクションの末尾へ移動します。
   */
  moveActionToSectionEnd(actionId: string, targetSection: string): boolean {
    const data = this.getData();
    const source = data.actions.find(a => a.id === actionId);
    if (!source) {
      return false;
    }

    const remaining = data.actions.filter(a => a.id !== actionId);
    const lastTargetIndex = (() => {
      for (let i = remaining.length - 1; i >= 0; i -= 1) {
        if (remaining[i].section === targetSection) {
          return i;
        }
      }
      return -1;
    })();
    if (lastTargetIndex < 0) {
      return false;
    }

    const movedAction: Action = { ...source, section: targetSection };
    const nextActions = [...remaining];
    nextActions.splice(lastTargetIndex + 1, 0, movedAction);

    this.saveData({
      actions: nextActions,
      sections: data.sections,
    });
    return true;
  }

  /**
   * アクションを複製し、元アクションの直後へ挿入します。
   */
  duplicateAction(actionId: string): Action | undefined {
    const data = this.getData();
    const sourceIndex = data.actions.findIndex(a => a.id === actionId);
    if (sourceIndex < 0) {
      return undefined;
    }

    const usedIds = new Set(data.actions.map(a => a.id));
    let id = generateId();
    while (usedIds.has(id)) {
      id = generateId();
    }

    const source = data.actions[sourceIndex];
    const duplicated: Action = {
      ...source,
      id,
      name: getDuplicatedActionName(source.name),
    };

    const nextActions = [...data.actions];
    nextActions.splice(sourceIndex + 1, 0, duplicated);

    this.saveData({
      actions: nextActions,
      sections: data.sections,
    });
    return duplicated;
  }

  /**
    * セクションと配下の全アクションを複製します。
    * 複製したセクションは元セクションの直後へ挿入されます。
   */
  duplicateSection(sectionName: string): string | undefined {
    const data = this.getData();
    const sections = [...(data.sections ?? [])];
    const sourceSectionIndex = sections.indexOf(sectionName);
    if (sourceSectionIndex < 0) {
      return undefined;
    }

    const sourceActions = data.actions.filter(a => a.section === sectionName);
    if (sourceActions.length === 0) {
      return undefined;
    }

    const duplicatedSectionName = getDuplicatedSectionName(sectionName, sections);
    const usedIds = new Set(data.actions.map(a => a.id));
    const duplicatedActions: Action[] = sourceActions.map(action => {
      let id = generateId();
      while (usedIds.has(id)) {
        id = generateId();
      }
      usedIds.add(id);
      return {
        ...action,
        id,
        section: duplicatedSectionName,
      };
    });

    const nextSections = [...sections];
    nextSections.splice(sourceSectionIndex + 1, 0, duplicatedSectionName);

    const insertIndex = (() => {
      for (let i = data.actions.length - 1; i >= 0; i -= 1) {
        if (data.actions[i].section === sectionName) {
          return i + 1;
        }
      }
      return data.actions.length;
    })();
    const nextActions = [...data.actions];
    nextActions.splice(insertIndex, 0, ...duplicatedActions);

    this.saveData({
      actions: nextActions,
      sections: nextSections,
    });
    return duplicatedSectionName;
  }

  /**
    * セクション名を変更し、所属アクションの section もあわせて更新します。
    * 名前未変更、変更先が既存、または対象セクション未存在のときは false を返します。
   */
  renameSection(oldName: string, newName: string): boolean {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) {
      return false;
    }

    const data = this.getData();
    const sections = data.sections ?? [];

    if (!sections.includes(oldName)) {
      return false;
    }
    if (sections.includes(trimmed)) {
      return false;
    }

    const nextSections = sections.map(s => (s === oldName ? trimmed : s));
    const nextActions = data.actions.map(a =>
      a.section === oldName ? { ...a, section: trimmed } : a
    );

    this.saveData({
      actions: nextActions,
      sections: nextSections,
    });
    return true;
  }

  /**
    * actions.json が存在しない場合は最小構成で作成します。
    * 既存の場合は不足しているトップレベルキー ($schema, sections, actions) を補完します。
   *
    * @returns 新規作成時は 'created'、不足キー補完時は 'updated'、変更不要時は 'noop' を返します。
   */
  initActionsFile(): 'created' | 'updated' | 'noop' {
    if (!this.actionsFilePath) {
      return 'noop';
    }
    const dir = path.dirname(this.actionsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.copySchemaFile(dir);

    if (!fs.existsSync(this.actionsFilePath)) {
      const minimal = { $schema: './actions.schema.json', sections: [] as string[], actions: [] as Action[] };
      fs.writeFileSync(this.actionsFilePath, JSON.stringify(minimal, null, 2), 'utf-8');
      return 'created';
    }

    try {
      const content = fs.readFileSync(this.actionsFilePath, 'utf-8');
      const raw = JSON.parse(content) as Record<string, unknown>;
      const patched = this.buildCanonicalInitFileData({
        ...raw,
        sections: 'sections' in raw ? raw.sections : [],
        actions: 'actions' in raw ? raw.actions : [],
      });
      const nextContent = JSON.stringify(patched, null, 2);

      if (content !== nextContent) {
        fs.writeFileSync(this.actionsFilePath, nextContent, 'utf-8');
        return 'updated';
      }
      return 'noop';
    } catch {
      return 'noop';
    }
  }
}
