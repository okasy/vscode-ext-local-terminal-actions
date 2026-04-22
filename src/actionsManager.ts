import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Action, ActionsData } from './types';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

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

  constructor(workspaceRoot: string | undefined, extensionPath?: string) {
    if (workspaceRoot) {
      this.actionsFilePath = path.join(workspaceRoot, '.vscode', 'actions.json');
    }
    if (extensionPath) {
      this.schemaSourcePath = path.join(extensionPath, 'schemas', 'actions.schema.json');
    }
  }

  hasWorkspace(): boolean {
    return this.actionsFilePath !== undefined;
  }

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

  getActions(): Action[] {
    return this.getData().actions;
  }

  getSections(): string[] {
    return this.getData().sections ?? [];
  }

  getActionsBySection(section: string): Action[] {
    return this.getActions().filter(a => a.section === section);
  }

  getCommonOnNewTerminalCommand(): string | undefined {
    return this.getData().commonOnNewTerminalCommand;
  }

  setCommonOnNewTerminalCommand(command: string | undefined): void {
    const data = this.getData();
    data.commonOnNewTerminalCommand = command?.trim() || undefined;
    this.saveData(data);
  }

  /**
   * Returns the configured delay (in seconds) to wait before running
   * commonOnNewTerminalCommand / onNewTerminalCommand on a freshly created terminal.
   */
  getNewTerminalDelaySeconds(): number | undefined {
    return this.getData().newTerminalDelaySeconds;
  }

  /**
   * Persists the delay seconds setting to actions.json.
   * Pass undefined or 0 to clear the setting.
   */
  setNewTerminalDelaySeconds(seconds: number | undefined): void {
    const data = this.getData();
    data.newTerminalDelaySeconds =
      seconds !== undefined && seconds > 0 ? seconds : undefined;
    this.saveData(data);
  }

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

  private copySchemaFile(dir: string): void {
    if (this.schemaSourcePath && fs.existsSync(this.schemaSourcePath)) {
      const schemaDest = path.join(dir, 'actions.schema.json');
      fs.copyFileSync(this.schemaSourcePath, schemaDest);
    }
  }

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

  deleteAction(id: string): void {
    const data = this.getData();
    data.actions = data.actions.filter(a => a.id !== id);
    this.saveData(data);
  }

  /**
   * Deletes a section and all actions contained in that section.
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
   * Duplicates a section and all actions contained in that section.
   * The duplicated section is inserted right after the source section.
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
   * Renames a section and updates all actions that belong to it.
   * Returns false when the name is unchanged, the target already exists, or the section is not found.
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
   * Creates actions.json with the minimal structure if it does not exist,
   * or adds any missing top-level keys ($schema, sections, actions) if it already exists.
   *
   * @returns 'created' when the file was newly created, 'updated' when missing keys were added,
   *          or 'noop' when no changes were necessary.
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
      let changed = false;

      // $schema を先頭に保証しつつ不足キーを補完する
      const patched: Record<string, unknown> = {};
      patched.$schema = (raw.$schema as string | undefined) ?? './actions.schema.json';
      if (!('$schema' in raw)) {
        changed = true;
      }
      for (const key of Object.keys(raw)) {
        if (key !== '$schema') {
          patched[key] = raw[key];
        }
      }
      if (!('sections' in raw)) {
        patched.sections = [];
        changed = true;
      }
      if (!('actions' in raw)) {
        patched.actions = [];
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(this.actionsFilePath, JSON.stringify(patched, null, 2), 'utf-8');
        return 'updated';
      }
      return 'noop';
    } catch {
      return 'noop';
    }
  }
}
