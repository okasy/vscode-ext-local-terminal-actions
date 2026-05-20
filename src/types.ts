/**
 * 1 件のターミナルアクションで使用する変数定義です。
 */
export interface ActionVariable {
  /** コマンド内のプレースホルダーで参照する変数名です。例: ${target} */
  name: string;
  /** 選択肢の一覧です。未指定または空の場合は自由入力を受け付けます。 */
  options?: string[];
}

/** アクションに保存するコマンド一覧です。 */
export type ActionCommand = string[];

/**
 * actions.json に保存される実行可能なターミナルアクションです。
 */
export interface Action {
  /** 一意な識別子です。自動生成されます。 */
  id: string;
  /** ツリー上で折りたたみ可能なグループとして表示するセクション名です。 */
  section: string;
  /** アクションの表示名です。 */
  name: string;
  /** 実行するシェルコマンド一覧です。通常 UI は先頭要素を表示します。 */
  commands: ActionCommand;
  /** 新しいターミナル作成直後に 1 回だけ実行する事前コマンドです。 */
  onNewTerminalCommand?: string;
  /** 使用するターミナルプロファイル名です。例: "bash", "zsh", "PowerShell" */
  terminalProfile?: string;
  /**
   * このセクションで既存ターミナルを再利用するかどうかです。
   * 未指定時は true として扱われます。
   */
  reuseTerminal?: boolean;
  /**
   * コマンド実行時の作業ディレクトリです。
   * ${workspaceFolder} の置換に対応します。
   */
  cwd?: string;
  /** 任意の説明文です。 */
  description?: string;
  /** コマンド内プレースホルダーで使用する任意の変数定義です。 */
  variables?: ActionVariable[];
  /** 実行前に確認ダイアログを表示するかどうかです。 */
  confirmBeforeRun?: boolean;
}

/**
 * Actions ツリーに表示するアクション実行状態です。
 */
export type ActionExecutionStatus = 'idle' | 'running' | 'success' | 'warning' | 'error';

/**
 * .vscode/actions.json のルート構造です。
 */
export interface ActionsData {
  /** ツリー表示で使用する明示的なセクション順です。 */
  sections?: string[];
  /** 新しいターミナル作成直後に 1 回だけ実行する共通事前コマンドです。 */
  commonOnNewTerminalCommand?: string;
  /**
   * 新しいターミナル作成後、commonOnNewTerminalCommand / onNewTerminalCommand を
   * 実行するまで待機する秒数です。
   * ターミナル起動時にエディタが自動で source を読み込む環境で有効です。
   */
  newTerminalDelaySeconds?: number;
  /** ツリー表示に出すアクション一覧です。 */
  actions: Action[];
}

/**
 * 現在の UI / 実行系で利用する先頭コマンドを返します。
 */
export function getPrimaryCommand(action: Pick<Action, 'commands'>): string {
  return action.commands[0] ?? '';
}

/**
 * 実行対象として扱うコマンド一覧を返します。
 */
export function getCommands(action: Pick<Action, 'commands'>): string[] {
  return action.commands;
}
