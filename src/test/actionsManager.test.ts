import test = require('node:test');
import assert = require('node:assert/strict');
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Action } from '../types';

interface VscodeStubModule {
  window: {
    showErrorMessage: (message: string) => void;
    showWarningMessage: (message: string) => void;
  };
  l10n: {
    t: (message: string, ...args: unknown[]) => string;
  };
}

interface LoadedFixture {
  manager: InstanceType<typeof import('../actionsManager').ActionsManager>;
  workspaceRoot: string;
  actionsFilePath: string;
  schemaDestPath: string;
  errors: string[];
  warnings: string[];
  readData: () => Record<string, unknown>;
}

interface ModuleLoader {
  _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
}

/**
 * プレースホルダー付きローカライズ文字列を簡易的に整形します。
 */
function formatMessage(message: string, args: unknown[]): string {
  return message.replace(/\{(\d+)\}/g, (_, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? '' : String(value);
  });
}

/**
 * ActionsManager が必要とする最小限の vscode モジュールを組み立てます。
 */
function createVscodeStub(): {
  module: VscodeStubModule;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  return {
    module: {
      window: {
        showErrorMessage: (message: string) => {
          errors.push(message);
        },
        showWarningMessage: (message: string) => {
          warnings.push(message);
        },
      },
      l10n: {
        t: (message: string, ...args: unknown[]) => formatMessage(message, args),
      },
    },
    errors,
    warnings,
  };
}

/**
 * vscode 依存をスタブへ差し替えた状態で ActionsManager を読み込みます。
 */
function loadActionsManager(vscodeModule: VscodeStubModule): typeof import('../actionsManager').ActionsManager {
  const moduleLoader = require('module') as ModuleLoader;
  const originalLoad = moduleLoader._load;
  const targetPath = path.resolve(__dirname, '..', 'actionsManager.js');

  moduleLoader._load = function patchedLoad(
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean
  ): unknown {
    if (request === 'vscode') {
      return vscodeModule;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(targetPath)];
    return (require(targetPath) as typeof import('../actionsManager')).ActionsManager;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

/**
 * テスト用の actions.json ワークスペースとスキーマ配置を作成します。
 */
function createWorkspaceFixture(initialData?: unknown): {
  workspaceRoot: string;
  actionsFilePath: string;
  schemaDestPath: string;
  extensionPath: string;
  readData: () => Record<string, unknown>;
} {
  const tmpRoot = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });

  const workspaceRoot = fs.mkdtempSync(path.join(tmpRoot, 'actions-manager-'));
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  fs.mkdirSync(vscodeDir, { recursive: true });

  const actionsFilePath = path.join(vscodeDir, 'actions.json');
  if (initialData !== undefined) {
    fs.writeFileSync(actionsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
  }

  const extensionPath = path.join(workspaceRoot, 'extension');
  const schemaSourceDir = path.join(extensionPath, 'schemas');
  fs.mkdirSync(schemaSourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(schemaSourceDir, 'actions.schema.json'),
    JSON.stringify({ type: 'object', additionalProperties: true }, null, 2),
    'utf-8'
  );

  return {
    workspaceRoot,
    actionsFilePath,
    schemaDestPath: path.join(vscodeDir, 'actions.schema.json'),
    extensionPath,
    readData: () => JSON.parse(fs.readFileSync(actionsFilePath, 'utf-8')) as Record<string, unknown>,
  };
}

/**
 * 1 テスト分の ActionsManager と周辺ファイル群をまとめて用意します。
 */
function createFixture(initialData?: unknown): LoadedFixture {
  const vscode = createVscodeStub();
  const workspace = createWorkspaceFixture(initialData);
  const ActionsManager = loadActionsManager(vscode.module);

  return {
    manager: new ActionsManager(workspace.workspaceRoot, workspace.extensionPath),
    workspaceRoot: workspace.workspaceRoot,
    actionsFilePath: workspace.actionsFilePath,
    schemaDestPath: workspace.schemaDestPath,
    errors: vscode.errors,
    warnings: vscode.warnings,
    readData: workspace.readData,
  };
}

/**
 * テストで扱う最小限の Action オブジェクトを生成します。
 */
function createAction(id: string, section: string, name: string, command = 'echo ok'): Action {
  return {
    id,
    section,
    name,
    commands: [command],
  };
}

test('initActionsFile creates a minimal actions.json and copies the schema', t => {
  const fixture = createFixture();
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.initActionsFile(), 'created');
  assert.equal(fs.existsSync(fixture.actionsFilePath), true);
  assert.equal(fs.existsSync(fixture.schemaDestPath), true);
  assert.deepEqual(fixture.readData(), {
    $schema: './actions.schema.json',
    sections: [],
    actions: [],
  });
});

test('initActionsFile patches missing root keys and canonicalizes action order', t => {
  const fixture = createFixture({
    note: 'keep me',
    sections: ['alpha', 'beta'],
    actions: [
      createAction('b', 'beta', 'Beta'),
      createAction('a', 'alpha', 'Alpha'),
      createAction('c', 'gamma', 'Gamma'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.initActionsFile(), 'updated');

  const data = fixture.readData();
  assert.equal(data.$schema, './actions.schema.json');
  assert.equal(data.note, 'keep me');
  assert.deepEqual((data.actions as Action[]).map(action => action.name), [
    'Alpha',
    'Beta',
    'Gamma',
  ]);
});

test('initActionsFile recreates schema when adjusting an existing actions.json', t => {
  const fixture = createFixture({
    sections: ['build'],
    actions: [createAction('a', 'build', 'Compile')],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fs.rmSync(fixture.schemaDestPath, { force: true });

  assert.equal(fixture.manager.initActionsFile(), 'updated');
  assert.equal(fs.existsSync(fixture.schemaDestPath), true);
});

test('initActionsFile applies the same migration rules as startup normalization', t => {
  const fixture = createFixture({
    note: 'keep me',
    sections: ['beta', '', 'beta', 'unused'],
    commonOnNewTerminalCommand: '  npm install  ',
    newTerminalDelaySeconds: 0,
    actions: [
      {
        id: 'a',
        section: 'beta',
        name: 'Build',
        command: '  npm run build  ',
      },
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.initActionsFile(), 'updated');

  const saved = fixture.readData();
  assert.equal(saved.$schema, './actions.schema.json');
  assert.equal(saved.note, 'keep me');
  assert.deepEqual(saved.sections, ['beta']);
  assert.equal(saved.commonOnNewTerminalCommand, 'npm install');
  assert.equal('newTerminalDelaySeconds' in saved, false);
  assert.equal('command' in (saved.actions as Array<Record<string, unknown>>)[0], false);
  assert.deepEqual((saved.actions as Array<{ commands: string[] }>)[0].commands, [
    'npm run build',
  ]);
});

test('getters normalize ids, sections, and optional settings when reading', t => {
  const fixture = createFixture({
    sections: ['beta', '', 'beta', 'unused'],
    commonOnNewTerminalCommand: '  npm install  ',
    newTerminalDelaySeconds: 0,
    actions: [
      createAction('', 'beta', 'First'),
      createAction('dup', 'alpha', 'Second'),
      createAction('dup', 'beta', 'Third'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  const actions = fixture.manager.getActions();
  const ids = actions.map(action => action.id);

  assert.equal(actions.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids.every(id => id.trim().length > 0), true);
  assert.equal(actions.every(action => Array.isArray(action.commands)), true);
  assert.deepEqual(fixture.manager.getSections(), ['beta', 'alpha']);
  assert.equal(fixture.manager.getCommonOnNewTerminalCommand(), 'npm install');
  assert.equal(fixture.manager.getNewTerminalDelaySeconds(), undefined);
  assert.equal(fixture.errors.length, 0);

  const saved = fixture.readData();
  assert.equal(new Set((saved.actions as Action[]).map(action => action.id)).size, 3);
  assert.deepEqual(saved.sections, ['beta', 'alpha']);
  assert.equal(saved.commonOnNewTerminalCommand, 'npm install');
  assert.equal('newTerminalDelaySeconds' in saved, false);
});

test('normalizePersistedData migrates legacy command key and string value to commands on startup', t => {
  const fixture = createFixture({
    sections: ['build'],
    actions: [
      {
        id: 'a',
        section: 'build',
        name: 'Compile',
        command: '  npm run compile  ',
      },
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fixture.manager.normalizePersistedData();

  const saved = fixture.readData();
  assert.equal('command' in (saved.actions as Array<Record<string, unknown>>)[0], false);
  assert.deepEqual((saved.actions as Array<{ commands: string[] }>)[0].commands, [
    'npm run compile',
  ]);
});

test('normalizePersistedData migrates legacy command arrays to commands on startup', t => {
  const fixture = createFixture({
    sections: ['build'],
    actions: [
      {
        id: 'a',
        section: 'build',
        name: 'Compile',
        command: ['npm run lint', 'npm run compile'],
      },
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fixture.manager.normalizePersistedData();

  const saved = fixture.readData();
  assert.equal('command' in (saved.actions as Array<Record<string, unknown>>)[0], false);
  assert.deepEqual((saved.actions as Array<{ commands: string[] }>)[0].commands, [
    'npm run lint',
    'npm run compile',
  ]);
});

test('normalizePersistedData refreshes the bundled schema even when actions data is unchanged', t => {
  const fixture = createFixture({
    sections: ['build'],
    actions: [createAction('a', 'build', 'Compile')],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fs.writeFileSync(
    fixture.schemaDestPath,
    JSON.stringify({ type: 'object', additionalProperties: false }, null, 2),
    'utf-8'
  );

  fixture.manager.normalizePersistedData();

  assert.deepEqual(
    JSON.parse(fs.readFileSync(fixture.schemaDestPath, 'utf-8')),
    { type: 'object', additionalProperties: true }
  );
});

test('normalizePersistedData does not recreate schema when it was manually removed', t => {
  const fixture = createFixture({
    sections: ['build'],
    actions: [
      {
        id: 'a',
        section: 'build',
        name: 'Compile',
        command: '  npm run compile  ',
      },
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fs.rmSync(fixture.schemaDestPath, { force: true });

  fixture.manager.normalizePersistedData();

  assert.equal(fs.existsSync(fixture.schemaDestPath), false);
  const saved = fixture.readData();
  assert.equal('command' in (saved.actions as Array<Record<string, unknown>>)[0], false);
  assert.deepEqual((saved.actions as Array<{ commands: string[] }>)[0].commands, [
    'npm run compile',
  ]);
});

test('addAction creates schema when actions.json is created for the first time', t => {
  const fixture = createFixture();
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  const added = fixture.manager.addAction({
    section: 'build',
    name: 'Compile',
    commands: ['npm run compile'],
  });

  assert.equal(added.id.trim().length > 0, true);
  assert.equal(fs.existsSync(fixture.actionsFilePath), true);
  assert.equal(fs.existsSync(fixture.schemaDestPath), true);
});

test('updateAction does not recreate schema when actions.json already exists without schema', t => {
  const fixture = createFixture({
    sections: ['build'],
    actions: [createAction('a', 'build', 'Compile')],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fs.rmSync(fixture.schemaDestPath, { force: true });

  fixture.manager.updateAction({
    id: 'a',
    section: 'build',
    name: 'Compile updated',
    commands: ['npm run compile'],
  });

  assert.equal(fs.existsSync(fixture.schemaDestPath), false);
  assert.equal((fixture.readData().actions as Action[])[0].name, 'Compile updated');
});

test('normal save operations preserve a manually removed schema file', async t => {
  const scenarios = [
    {
      name: 'addAction on existing actions file',
      initialData: {
        sections: ['build'],
        actions: [createAction('a', 'build', 'Compile')],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.addAction({
          section: 'build',
          name: 'Lint',
          commands: ['npm run lint'],
        });
      },
      assertData: (fixture: LoadedFixture) => {
        assert.equal((fixture.readData().actions as Action[]).length, 2);
      },
    },
    {
      name: 'setCommonOnNewTerminalCommand',
      initialData: {
        sections: ['build'],
        actions: [createAction('a', 'build', 'Compile')],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.setCommonOnNewTerminalCommand('  echo setup  ');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.equal(fixture.readData().commonOnNewTerminalCommand, 'echo setup');
      },
    },
    {
      name: 'setNewTerminalDelaySeconds',
      initialData: {
        sections: ['build'],
        actions: [createAction('a', 'build', 'Compile')],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.setNewTerminalDelaySeconds(3);
      },
      assertData: (fixture: LoadedFixture) => {
        assert.equal(fixture.readData().newTerminalDelaySeconds, 3);
      },
    },
    {
      name: 'deleteAction',
      initialData: {
        sections: ['build'],
        actions: [createAction('a', 'build', 'Compile')],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.deleteAction('a');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.deepEqual(fixture.readData().actions, []);
      },
    },
    {
      name: 'renameSection',
      initialData: {
        sections: ['build'],
        actions: [createAction('a', 'build', 'Compile')],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.renameSection('build', 'release');
      },
      assertData: (fixture: LoadedFixture) => {
        const data = fixture.readData();
        assert.deepEqual(data.sections, ['release']);
        assert.equal((data.actions as Action[])[0].section, 'release');
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const fixture = createFixture(scenario.initialData);
      t.after(() => {
        fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
      });

      fs.rmSync(fixture.schemaDestPath, { force: true });

      scenario.mutate(fixture);

      assert.equal(fs.existsSync(fixture.schemaDestPath), false);
      scenario.assertData(fixture);
    });
  }
});

test('reorder and duplicate operations preserve a manually removed schema file', async t => {
  const scenarios = [
    {
      name: 'deleteSection',
      initialData: {
        sections: ['build', 'test'],
        actions: [
          createAction('a', 'build', 'Compile'),
          createAction('b', 'build', 'Lint'),
          createAction('c', 'test', 'Verify'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.deleteSection('build');
      },
      assertData: (fixture: LoadedFixture) => {
        const data = fixture.readData();
        assert.deepEqual(data.sections, ['test']);
        assert.deepEqual((data.actions as Action[]).map(action => action.id), ['c']);
      },
    },
    {
      name: 'moveSection',
      initialData: {
        sections: ['a', 'b', 'c'],
        actions: [
          createAction('a1', 'a', 'A'),
          createAction('b1', 'b', 'B'),
          createAction('c1', 'c', 'C'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.moveSection('b', 'up');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.deepEqual(fixture.readData().sections, ['b', 'a', 'c']);
      },
    },
    {
      name: 'moveSectionBefore',
      initialData: {
        sections: ['a', 'b', 'c'],
        actions: [
          createAction('a1', 'a', 'A'),
          createAction('b1', 'b', 'B'),
          createAction('c1', 'c', 'C'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.moveSectionBefore('c', 'a');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.deepEqual(fixture.readData().sections, ['c', 'a', 'b']);
      },
    },
    {
      name: 'moveActionInSection',
      initialData: {
        sections: ['build', 'test'],
        actions: [
          createAction('a', 'build', 'Compile'),
          createAction('b', 'build', 'Lint'),
          createAction('c', 'test', 'Verify'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.moveActionInSection('b', 'up');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.deepEqual(
          (fixture.readData().actions as Action[]).map(action => `${action.section}:${action.id}`),
          ['build:b', 'build:a', 'test:c']
        );
      },
    },
    {
      name: 'moveActionBeforeInSection',
      initialData: {
        sections: ['build', 'test'],
        actions: [
          createAction('a', 'build', 'Compile'),
          createAction('b', 'build', 'Lint'),
          createAction('c', 'test', 'Verify'),
          createAction('d', 'test', 'Smoke'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.moveActionBeforeInSection('a', 'c');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.deepEqual(
          (fixture.readData().actions as Action[]).map(action => `${action.section}:${action.id}`),
          ['build:b', 'test:a', 'test:c', 'test:d']
        );
      },
    },
    {
      name: 'moveActionToSectionEnd',
      initialData: {
        sections: ['build', 'test'],
        actions: [
          createAction('a', 'build', 'Compile'),
          createAction('b', 'build', 'Lint'),
          createAction('c', 'test', 'Verify'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.moveActionToSectionEnd('b', 'test');
      },
      assertData: (fixture: LoadedFixture) => {
        assert.deepEqual(
          (fixture.readData().actions as Action[]).map(action => `${action.section}:${action.id}`),
          ['build:a', 'test:c', 'test:b']
        );
      },
    },
    {
      name: 'duplicateAction',
      initialData: {
        sections: ['common'],
        actions: [
          createAction('a', 'common', 'Build'),
          createAction('b', 'common', 'Build (2)'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.duplicateAction('b');
      },
      assertData: (fixture: LoadedFixture) => {
        const actions = fixture.readData().actions as Action[];
        assert.equal(actions.length, 3);
        assert.equal(actions[2].name, 'Build (3)');
      },
    },
    {
      name: 'duplicateSection',
      initialData: {
        sections: ['common', 'other'],
        actions: [
          createAction('a', 'common', 'Build'),
          createAction('b', 'common', 'Lint'),
          createAction('c', 'other', 'Test'),
        ],
      },
      mutate: (fixture: LoadedFixture) => {
        fixture.manager.duplicateSection('common');
      },
      assertData: (fixture: LoadedFixture) => {
        const data = fixture.readData();
        assert.deepEqual(data.sections, ['common', 'common (2)', 'other']);
        assert.equal(
          (data.actions as Action[]).filter(action => action.section === 'common (2)').length,
          2
        );
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const fixture = createFixture(scenario.initialData);
      t.after(() => {
        fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
      });

      fs.rmSync(fixture.schemaDestPath, { force: true });

      scenario.mutate(fixture);

      assert.equal(fs.existsSync(fixture.schemaDestPath), false);
      scenario.assertData(fixture);
    });
  }
});

test('addAction and setting updates persist normalized values', t => {
  const fixture = createFixture({ sections: [], actions: [] });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  const added = fixture.manager.addAction({
    section: 'build',
    name: 'Compile',
    commands: ['npm run compile'],
  });
  fixture.manager.setCommonOnNewTerminalCommand('  echo setup  ');
  fixture.manager.setNewTerminalDelaySeconds(5);

  assert.equal(added.id.trim().length > 0, true);
  assert.deepEqual(fixture.manager.getSections(), ['build']);
  assert.equal(fixture.manager.getCommonOnNewTerminalCommand(), 'echo setup');
  assert.equal(fixture.manager.getNewTerminalDelaySeconds(), 5);

  fixture.manager.setNewTerminalDelaySeconds(0);
  assert.equal(fixture.manager.getNewTerminalDelaySeconds(), undefined);
});

test('updateAction and deleteAction refresh sections from remaining actions', t => {
  const fixture = createFixture({
    sections: ['build', 'test'],
    actions: [
      createAction('a', 'build', 'Compile'),
      createAction('b', 'test', 'Verify'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  fixture.manager.updateAction({
    id: 'a',
    section: 'deploy',
    name: 'Release',
    commands: ['npm publish'],
  });

  assert.deepEqual(fixture.manager.getSections(), ['test', 'deploy']);

  fixture.manager.deleteAction('b');
  assert.deepEqual(fixture.manager.getSections(), ['deploy']);
  assert.deepEqual(fixture.manager.getActions().map(action => action.id), ['a']);
});

test('deleteSection removes the section and all belonging actions', t => {
  const fixture = createFixture({
    sections: ['build', 'test'],
    actions: [
      createAction('a', 'build', 'Compile'),
      createAction('b', 'build', 'Lint'),
      createAction('c', 'test', 'Verify'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.deleteSection('build'), true);
  assert.equal(fixture.manager.deleteSection('missing'), false);
  assert.deepEqual(fixture.manager.getSections(), ['test']);
  assert.deepEqual(fixture.manager.getActions().map(action => action.id), ['c']);
});

test('moveSection and moveSectionBefore reorder only valid sections', t => {
  const fixture = createFixture({
    sections: ['a', 'b', 'c'],
    actions: [
      createAction('a1', 'a', 'A'),
      createAction('b1', 'b', 'B'),
      createAction('c1', 'c', 'C'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.moveSection('b', 'up'), true);
  assert.equal(fixture.manager.moveSection('b', 'up'), false);
  assert.equal(fixture.manager.moveSectionBefore('c', 'a'), true);
  assert.equal(fixture.manager.moveSectionBefore('c', 'c'), false);
  assert.deepEqual(fixture.manager.getSections(), ['b', 'c', 'a']);
});

test('moveActionInSection only swaps within the same section', t => {
  const fixture = createFixture({
    sections: ['build', 'test'],
    actions: [
      createAction('a', 'build', 'Compile'),
      createAction('b', 'build', 'Lint'),
      createAction('c', 'test', 'Verify'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.moveActionInSection('b', 'up'), true);
  assert.equal(fixture.manager.moveActionInSection('b', 'up'), false);
  assert.equal(fixture.manager.moveActionInSection('c', 'up'), false);
  assert.deepEqual(
    fixture.manager.getActions().map(action => `${action.section}:${action.id}`),
    ['build:b', 'build:a', 'test:c']
  );
});

test('moveActionBeforeInSection and moveActionToSectionEnd move actions across sections', t => {
  const fixture = createFixture({
    sections: ['build', 'test'],
    actions: [
      createAction('a', 'build', 'Compile'),
      createAction('b', 'build', 'Lint'),
      createAction('c', 'test', 'Verify'),
      createAction('d', 'test', 'Smoke'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.moveActionBeforeInSection('a', 'c'), true);
  assert.deepEqual(
    fixture.manager.getActions().map(action => `${action.section}:${action.id}`),
    ['build:b', 'test:a', 'test:c', 'test:d']
  );

  assert.equal(fixture.manager.moveActionToSectionEnd('b', 'test'), true);
  assert.equal(fixture.manager.moveActionToSectionEnd('missing', 'test'), false);
  assert.equal(fixture.manager.moveActionToSectionEnd('a', 'deploy'), false);
  assert.deepEqual(
    fixture.manager.getActions().map(action => `${action.section}:${action.id}`),
    ['test:a', 'test:c', 'test:d', 'test:b']
  );
});

test('duplicateAction and duplicateSection insert renamed copies next to the source', t => {
  const fixture = createFixture({
    sections: ['common', 'common (2)', 'other'],
    actions: [
      createAction('a', 'common', 'Build'),
      createAction('b', 'common', 'Build (2)'),
      createAction('x', 'common (2)', 'Build Copy'),
      createAction('c', 'other', 'Test'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  const duplicatedAction = fixture.manager.duplicateAction('b');
  const duplicatedSection = fixture.manager.duplicateSection('common');

  assert.ok(duplicatedAction);
  assert.equal(duplicatedAction?.name, 'Build (3)');
  assert.equal(duplicatedSection, 'common (3)');
  assert.deepEqual(fixture.manager.getSections(), ['common', 'common (3)', 'common (2)', 'other']);

  const actions = fixture.manager.getActions();
  assert.equal(actions.filter(action => action.section === 'common (3)').length, 3);
  assert.equal(actions[2].name, 'Build (3)');
});

test('renameSection validates the target name and updates belonging actions', t => {
  const fixture = createFixture({
    sections: ['build', 'test'],
    actions: [
      createAction('a', 'build', 'Compile'),
      createAction('b', 'test', 'Verify'),
    ],
  });
  t.after(() => {
    fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
  });

  assert.equal(fixture.manager.renameSection('build', ' release '), true);
  assert.equal(fixture.manager.renameSection('missing', 'noop'), false);
  assert.equal(fixture.manager.renameSection('test', 'release'), false);
  assert.equal(fixture.manager.renameSection('test', 'test'), false);
  assert.deepEqual(fixture.manager.getSections(), ['release', 'test']);
  assert.deepEqual(
    fixture.manager.getActions().map(action => `${action.id}:${action.section}`),
    ['a:release', 'b:test']
  );
});