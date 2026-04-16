import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Action, ActionsData } from './types';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Manages reading and writing of .vscode/actions.json.
 */
export class ActionsManager {
  private readonly actionsFilePath: string | undefined;

  constructor(workspaceRoot: string | undefined) {
    if (workspaceRoot) {
      this.actionsFilePath = path.join(workspaceRoot, '.vscode', 'actions.json');
    }
  }

  hasWorkspace(): boolean {
    return this.actionsFilePath !== undefined;
  }

  getActions(): Action[] {
    if (!this.actionsFilePath || !fs.existsSync(this.actionsFilePath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(this.actionsFilePath, 'utf-8');
      const data: ActionsData = JSON.parse(content);
      return Array.isArray(data.actions) ? data.actions : [];
    } catch (err) {
      vscode.window.showErrorMessage(
        `Local Terminal Actions: Failed to read actions.json – ${err}`
      );
      return [];
    }
  }

  getSections(): string[] {
    const seen = new Set<string>();
    const sections: string[] = [];
    for (const action of this.getActions()) {
      if (!seen.has(action.section)) {
        seen.add(action.section);
        sections.push(action.section);
      }
    }
    return sections;
  }

  getActionsBySection(section: string): Action[] {
    return this.getActions().filter(a => a.section === section);
  }

  private saveActions(actions: Action[]): void {
    if (!this.actionsFilePath) {
      vscode.window.showWarningMessage(
        'Local Terminal Actions: No workspace folder open. Please open a folder first.'
      );
      return;
    }
    const dir = path.dirname(this.actionsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data: ActionsData = { actions };
    fs.writeFileSync(this.actionsFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  addAction(action: Omit<Action, 'id'>): Action {
    const newAction: Action = { ...action, id: generateId() };
    const actions = this.getActions();
    actions.push(newAction);
    this.saveActions(actions);
    return newAction;
  }

  updateAction(action: Action): void {
    const actions = this.getActions();
    const index = actions.findIndex(a => a.id === action.id);
    if (index >= 0) {
      actions[index] = action;
      this.saveActions(actions);
    }
  }

  deleteAction(id: string): void {
    const actions = this.getActions().filter(a => a.id !== id);
    this.saveActions(actions);
  }
}
