import test = require('node:test');
import assert = require('node:assert/strict');
import * as path from 'node:path';
import type { Action } from '../types';

interface VscodeStubModule {
  window: {
    terminals: TerminalStub[];
    createTerminal: (options: { name?: string; shellPath?: string; cwd?: string }) => TerminalStub;
    onDidStartTerminalShellExecution: (
      listener: (event: { terminal: TerminalStub; execution: TerminalExecutionStub }) => void
    ) => { dispose: () => void };
    onDidEndTerminalShellExecution: (
      listener: (event: { execution: TerminalExecutionStub; exitCode: number | undefined }) => void
    ) => { dispose: () => void };
    onDidCloseTerminal: (listener: (terminal: TerminalStub) => void) => { dispose: () => void };
    showWarningMessage: (
      message: string,
      options?: { modal?: boolean; detail?: string },
      item?: string
    ) => Promise<string | undefined>;
    showErrorMessage: (message: string) => void;
    showQuickPick: <T extends { label: string }>(
      items: T[]
    ) => Promise<T | undefined>;
    showInputBox: () => Promise<string | undefined>;
  };
  workspace: {
    workspaceFolders: Array<{ uri: { fsPath: string } }>;
    getConfiguration: (section: string) => {
      get: <T>(key: string) => T | undefined;
    };
  };
  l10n: {
    t: (message: string, ...args: unknown[]) => string;
  };
}

interface ModuleLoader {
  _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
}

interface TerminalStub {
  name: string;
  sentTexts: string[];
  shown: boolean;
  disposed: boolean;
  sendText: (text: string) => void;
  show: (preserveFocus?: boolean) => void;
  dispose: () => void;
}

interface TerminalExecutionStub {
  commandLine: {
    value: string;
  };
}

interface LoadedFixture {
  manager: InstanceType<typeof import('../terminalManager').TerminalManager>;
  terminals: TerminalStub[];
  errors: string[];
  warningMessages: Array<{ message: string; detail?: string }>;
  fireStart: (terminal: TerminalStub, command: string) => TerminalExecutionStub;
  fireEnd: (execution: TerminalExecutionStub, exitCode: number | undefined) => void;
  setWarningResponses: (responses: Array<string | undefined>) => void;
  setQuickPickResponses: (responses: Array<{ label: string } | undefined>) => void;
  setInputBoxResponses: (responses: Array<string | undefined>) => void;
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
 * テスト用の最小アクションを生成します。
 */
function createAction(overrides?: Partial<Action>): Action {
  return {
    id: 'action-1',
    section: 'build',
    name: 'Build',
    commands: ['echo first'],
    ...overrides,
  };
}

/**
 * テスト中だけ setTimeout を即時実行へ置き換えます。
 */
function useImmediateTimeouts(t: test.TestContext): void {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = ((callback: (...args: unknown[]) => void, _delay?: number) => {
    callback();
    return 0 as unknown as NodeJS.Timeout;
  }) as typeof setTimeout;
  t.after(() => {
    global.setTimeout = originalSetTimeout;
  });
}

/**
 * vscode 依存をスタブへ差し替えた状態で TerminalManager を読み込みます。
 */
function loadTerminalManager(vscodeModule: VscodeStubModule): typeof import('../terminalManager').TerminalManager {
  const moduleLoader = require('module') as ModuleLoader;
  const originalLoad = moduleLoader._load;
  const targetPath = path.resolve(__dirname, '..', 'terminalManager.js');

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
    return (require(targetPath) as typeof import('../terminalManager')).TerminalManager;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

/**
 * TerminalManager テスト用の vscode スタブ一式を生成します。
 */
function createFixture(
  t: test.TestContext,
  callbacks?: ConstructorParameters<typeof import('../terminalManager').TerminalManager>[0]
): LoadedFixture {
  useImmediateTimeouts(t);

  const terminals: TerminalStub[] = [];
  const errors: string[] = [];
  const warningMessages: Array<{ message: string; detail?: string }> = [];
  let warningResponses: Array<string | undefined> = [];
  let quickPickResponses: Array<{ label: string } | undefined> = [];
  let inputBoxResponses: Array<string | undefined> = [];
  const startListeners: Array<
    (event: { terminal: TerminalStub; execution: TerminalExecutionStub }) => void
  > = [];
  const endListeners: Array<
    (event: { execution: TerminalExecutionStub; exitCode: number | undefined }) => void
  > = [];
  const closeListeners: Array<(terminal: TerminalStub) => void> = [];

  const vscodeModule: VscodeStubModule = {
    window: {
      terminals,
      createTerminal: options => {
        const terminal: TerminalStub = {
          name: options.name ?? 'terminal',
          sentTexts: [],
          shown: false,
          disposed: false,
          sendText: text => {
            terminal.sentTexts.push(text);
          },
          show: () => {
            terminal.shown = true;
          },
          dispose: () => {
            terminal.disposed = true;
            const index = terminals.indexOf(terminal);
            if (index >= 0) {
              terminals.splice(index, 1);
            }
            for (const listener of closeListeners) {
              listener(terminal);
            }
          },
        };
        terminals.push(terminal);
        return terminal;
      },
      onDidStartTerminalShellExecution: listener => {
        startListeners.push(listener);
        return { dispose: () => undefined };
      },
      onDidEndTerminalShellExecution: listener => {
        endListeners.push(listener);
        return { dispose: () => undefined };
      },
      onDidCloseTerminal: listener => {
        closeListeners.push(listener);
        return { dispose: () => undefined };
      },
      showWarningMessage: async (message, options, item) => {
        warningMessages.push({ message, detail: options?.detail });
        if (warningResponses.length > 0) {
          return warningResponses.shift();
        }
        return item;
      },
      showErrorMessage: message => {
        errors.push(message);
      },
      showQuickPick: async <T extends { label: string }>() =>
        quickPickResponses.shift() as T | undefined,
      showInputBox: async () => inputBoxResponses.shift(),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      getConfiguration: _section => ({
        get: <T>(_key: string) => ({}) as T,
      }),
    },
    l10n: {
      t: (message: string, ...args: unknown[]) => formatMessage(message, args),
    },
  };

  const TerminalManager = loadTerminalManager(vscodeModule);
  const manager = new TerminalManager(callbacks);
  t.after(() => {
    manager.dispose();
  });

  return {
    manager,
    terminals,
    errors,
    warningMessages,
    fireStart: (terminal, command) => {
      const execution: TerminalExecutionStub = {
        commandLine: { value: command },
      };
      for (const listener of startListeners) {
        listener({ terminal, execution });
      }
      return execution;
    },
    fireEnd: (execution, exitCode) => {
      for (const listener of endListeners) {
        listener({ execution, exitCode });
      }
    },
    setWarningResponses: responses => {
      warningResponses = [...responses];
    },
    setQuickPickResponses: responses => {
      quickPickResponses = [...responses];
    },
    setInputBoxResponses: responses => {
      inputBoxResponses = [...responses];
    },
  };
}

test('runAction executes commands sequentially and completes after the last success', async t => {
  const running: string[] = [];
  const completed: Array<number | undefined> = [];
  const fixture = createFixture(t, {
    onRunning: action => {
      running.push(action.id);
    },
    onCompleted: (_action, exitCode) => {
      completed.push(exitCode);
    },
  });

  const action = createAction({
    commands: ['echo first', 'echo second'],
  });

  await fixture.manager.runAction(action);

  assert.equal(fixture.terminals.length, 1);
  assert.deepEqual(fixture.terminals[0].sentTexts, ['echo first']);
  assert.deepEqual(running, []);
  assert.deepEqual(completed, []);

  const firstExecution = fixture.fireStart(fixture.terminals[0], 'echo first');
  assert.deepEqual(running, ['action-1']);
  fixture.fireEnd(firstExecution, 0);

  assert.deepEqual(fixture.terminals[0].sentTexts, ['echo first', 'echo second']);
  assert.deepEqual(completed, []);

  const secondExecution = fixture.fireStart(fixture.terminals[0], 'echo second');
  fixture.fireEnd(secondExecution, 0);

  assert.deepEqual(running, ['action-1']);
  assert.deepEqual(completed, [0]);
});

test('runAction stops remaining commands when a command fails', async t => {
  const completed: Array<number | undefined> = [];
  const fixture = createFixture(t, {
    onCompleted: (_action, exitCode) => {
      completed.push(exitCode);
    },
  });

  await fixture.manager.runAction(
    createAction({
      commands: ['echo first', 'echo second'],
    })
  );

  const firstExecution = fixture.fireStart(fixture.terminals[0], 'echo first');
  fixture.fireEnd(firstExecution, 1);

  assert.deepEqual(fixture.terminals[0].sentTexts, ['echo first']);
  assert.deepEqual(completed, [1]);
});

test('runAction sends common and per-action pre-commands only for newly created terminals', async t => {
  const fixture = createFixture(t, {
    getCommonOnNewTerminalCommand: () => 'echo setup',
  });

  await fixture.manager.runAction(
    createAction({
      onNewTerminalCommand: 'source .env.local',
      commands: ['echo first'],
    })
  );

  assert.deepEqual(fixture.terminals[0].sentTexts, [
    'echo setup',
    'source .env.local',
    'echo first',
  ]);
});

test('runAction does not rerun pre-commands when reusing an existing terminal', async t => {
  const fixture = createFixture(t, {
    getCommonOnNewTerminalCommand: () => 'echo setup',
  });
  const existing = fixture.terminals;
  const reusedTerminal = {
    name: '[LTA] build',
    sentTexts: [] as string[],
    shown: false,
    disposed: false,
    sendText(text: string) {
      this.sentTexts.push(text);
    },
    show() {
      this.shown = true;
    },
    dispose() {
      this.disposed = true;
    },
  };
  existing.push(reusedTerminal);

  await fixture.manager.runAction(
    createAction({
      onNewTerminalCommand: 'source .env.local',
      commands: ['echo first'],
    })
  );

  assert.deepEqual(reusedTerminal.sentTexts, ['echo first']);
  assert.equal(reusedTerminal.shown, true);
});

test('runAction resolves variables across all commands before sequential execution', async t => {
  const fixture = createFixture(t);
  fixture.setQuickPickResponses([{ label: 'prod' }]);

  await fixture.manager.runAction(
    createAction({
      commands: ['echo ${target}', 'deploy ${target}'],
      variables: [
        {
          name: 'target',
          options: ['prod', 'dev'],
        },
      ],
    })
  );

  assert.deepEqual(fixture.terminals[0].sentTexts, ['echo prod']);

  const firstExecution = fixture.fireStart(fixture.terminals[0], 'echo prod');
  fixture.fireEnd(firstExecution, 0);

  assert.deepEqual(fixture.terminals[0].sentTexts, ['echo prod', 'deploy prod']);
});

test('runAction shows a joined confirmation detail for multiple commands and cancels cleanly', async t => {
  const fixture = createFixture(t);
  fixture.setWarningResponses([undefined]);

  await fixture.manager.runAction(
    createAction({
      confirmBeforeRun: true,
      commands: ['echo first', 'echo second'],
    })
  );

  assert.equal(fixture.terminals.length, 0);
  assert.deepEqual(fixture.warningMessages, [
    {
      message: 'Run action "Build"?',
      detail: 'echo first\necho second',
    },
  ]);
});

test('runAction reports an error and does not create a terminal when commands are empty', async t => {
  const fixture = createFixture(t);

  await fixture.manager.runAction(
    createAction({
      commands: [],
    })
  );

  assert.deepEqual(fixture.errors, ['Action "Build" has no runnable commands.']);
  assert.equal(fixture.terminals.length, 0);
});