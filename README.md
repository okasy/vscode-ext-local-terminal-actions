# Terminal Actions

[![Version](https://img.shields.io/github/v/tag/okasy/vscode-ext-local-terminal-actions?sort=semver&label=Version)](https://github.com/okasy/vscode-ext-local-terminal-actions/releases)
[![Released](https://img.shields.io/github/release-date/okasy/vscode-ext-local-terminal-actions?label=Released)](https://github.com/okasy/vscode-ext-local-terminal-actions/releases)
[![License](https://img.shields.io/github/license/okasy/vscode-ext-local-terminal-actions?label=License)](https://github.com/okasy/vscode-ext-local-terminal-actions/blob/main/LICENSE)
[![Marketplace](https://img.shields.io/badge/Marketplace-Visual%20Studio%20Marketplace-0078d4)](https://marketplace.visualstudio.com/items?itemName=okasy.local-terminal-actions)

ターミナルで任意のコマンドをワンボタンで起動させられるようになる VS Code 拡張です。

登録したコマンドはプロジェクトの `.vscode/actions.json` に保存され、チームで共有できます。

Marketplace: [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=okasy.local-terminal-actions)

---

## インストール

- VS Code Marketplace からインストール:
  [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=okasy.local-terminal-actions)
- VS Code のクイックオープン（`Cmd+P`）で次を実行:
  `ext install okasy.local-terminal-actions`

---

## 機能

- **サイドバーに専用アイコン** – アクティビティバーに「Terminal Actions」アイコンが追加されます。
- **Actions ビュー** – 登録済みコマンドをセクション別のツリーで表示。クリックひとつで実行。
- **Setting ビュー** – サブテキスト表示の切り替え、新規ターミナル待機秒数と共通プリコマンドの編集、actions.json の作成・調整、actions.json を開く操作をまとめた一般設定ビュー。
- **Edit Actions ビュー** – アクション名変更、説明変更、複製、削除と、セクション複製、名前変更、削除に対応した編集専用ビュー。ドラッグ&ドロップで並び替えできます。
- **プロジェクト共有** – `.vscode/actions.json` に保存されるため Git で共有可能。
- **Schema 自動配置** – `.vscode/actions.schema.json` を自動配置し、`actions.json` に `$schema` を設定。
- **Agent 編集に対応** – schema 定義により、Agent が設定ファイルを安全に補完・検証しながら編集できます。
- **ターミナルプロファイル選択** – bash / zsh / PowerShell など VS Code に登録されたプロファイルから選択。
- **ターミナル再利用** – セクション単位でターミナルを再利用するか、毎回新規作成するかを設定可能。
- **作業ディレクトリ** – コマンドごとに `cwd` を指定可能。`${workspaceFolder}` が使用できます。
- **起動パラメータ変数** – コマンド中の `${name}` に対して、実行時に値を入力または選択できます。
- **実行前確認** – アクションごとに、実行前の確認ダイアログを必須化できます。
- **クイック追加と詳細編集** – 新規追加は 4 ステップ、編集は 10 ステップのウィザードで詳細設定まで行えます。
- **セクション管理** – セクションの複製、名前変更、削除に対応しています。
- **実行ステータス表示** – 実行中、成功、失敗などの状態をツリー上のアイコンで確認できます。

---

## 使い方

### コマンドの登録

1. アクティビティバーの **Terminal Actions** アイコンをクリック。
2. **Actions** ビューのタイトルバーで `＋`（Add Action）ボタンを押す。
3. Add new では 4 ステップの基本項目を入力する。

| ステップ | 項目 | 説明 |
| --- | --- | --- |
| 1 | セクション | ツリーの枝名。既存から選択または新規入力 |
| 2 | アクション名 | 表示名（例: `Start services`） |
| 3 | コマンド | `commands` の先頭要素。通常 UI では先頭だけ編集し、残りは保持します |
| 4 | 説明 | 任意のメモ |

詳細編集（Edit Actions ビューから実行）:

- 変数定義
- ターミナルプロファイル
- 実行前確認
- ターミナル再利用
- 作業ディレクトリ
- セクション変更

編集ウィザードは次の 10 項目に対応しています。

| ステップ | 項目 | 説明 |
| --- | --- | --- |
| 1 | セクション | 既存セクションへの移動または新規セクション名の入力 |
| 2 | アクション名 | ツリーに表示する名前 |
| 3 | コマンド | 実行するシェルコマンド |
| 4 | 新規ターミナル先行コマンド | 新規ターミナル作成直後に実行する任意コマンド |
| 5 | 変数定義 | `name=option1\|option2\|*` 形式で指定 |
| 6 | 説明 | サブテキストに表示できる任意の説明 |
| 7 | 実行前確認 | 実行前ダイアログを出すかどうか |
| 8 | ターミナル再利用 | セクション単位で再利用するかどうか |
| 9 | ターミナルプロファイル | 使用する VS Code ターミナルプロファイル |
| 10 | 作業ディレクトリ | `${workspaceFolder}` を含むパス指定が可能 |

### コマンドの実行

- **Actions** ビューのアクション名をクリック、または右クリック → **Run Action**。
- インラインの `▶` ボタンでも実行できます。

### コマンドの編集・複製・削除

- **Actions** ビューの右クリックから **Rename Action** / **Edit Description** を実行できます。
- **Edit Actions** ビューのアクション名をクリックすると、10 項目の編集ウィザードが開きます。
- **Edit Actions** ビューの右クリックから **Edit Action** / **Duplicate Action** / **Rename Action** / **Edit Description** / **Delete Action** を実行できます。
- インラインの `✏` / `⧉` / `🗑` ボタンでも編集・複製・削除を実行できます。

### セクションの管理

- **Edit Actions** ビューでセクションに対して **Rename Section** / **Duplicate Section** / **Delete Section** を実行できます。
- アクションとセクションはドラッグ&ドロップで並び替えできます。

### Setting ビューでできること

- ツリーのサブテキスト表示を「コマンド / 説明 / 非表示」で切り替え
- 新規ターミナル起動後の待機秒数を編集
- 全アクション共通の新規ターミナル先行コマンドを編集
- `.vscode/actions.json` を最小構成で作成、または不足キーを補完
- `.vscode/actions.json` をエディターで開く

---

## actions.json の形式

**Create / Adjust Settings File** を実行すると、`.vscode/actions.json` が存在しない場合は最小構成で作成されます。既存ファイルがある場合は `.vscode/actions.schema.json` を配置し、`$schema` / `sections` / `actions` など不足しているルートキーを補完します。
これにより、JSON スキーマに基づく補完・検証に加えて、Agent に設定ファイル編集を任せやすくなります。

```json
{
  "commonOnNewTerminalCommand": "source ~/.zshrc",
  "newTerminalDelaySeconds": 1.5,
  "sections": [
    "Docker"
  ],
  "actions": [
    {
      "id": "abc123-xyz",
      "section": "Docker",
      "name": "Start services",
      "commands": [
        "docker compose pull",
        "docker compose up -d"
      ],
      "onNewTerminalCommand": "source .env.local",
      "terminalProfile": "bash",
      "reuseTerminal": true,
      "cwd": "${workspaceFolder}",
      "description": "Start all Docker Compose services in the background",
      "variables": [
        {
          "name": "target",
          "options": ["ingame", "outgame", "admin", "*"]
        }
      ],
      "confirmBeforeRun": true
    }
  ]
}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `sections` | — | セクションの表示順。省略時は `actions` から自動推定 |
| `commonOnNewTerminalCommand` | — | 全アクション共通の先行コマンド。新規ターミナル作成時に 1 回だけ実行（再利用時は実行しない） |
| `newTerminalDelaySeconds` | — | 新規ターミナル作成後、先行コマンドを実行するまで待機する秒数 |
| `id` | ✓ | 自動生成される一意の ID |
| `section` | ✓ | ツリーの枝名（グループ） |
| `name` | ✓ | アクションの表示名 |
| `commands` | ✓ | 上から順番に実行するシェルコマンド配列。いずれかが非 0 終了すると残りは中断 |
| `onNewTerminalCommand` | — | 新規ターミナル作成直後に 1 回だけ実行する先行コマンド（既存ターミナル再利用時は実行しない） |
| `terminalProfile` | — | ターミナルプロファイル名 |
| `reuseTerminal` | — | `true`: セクション単位で再利用（既定）、`false`: 毎回新規 |
| `cwd` | — | 作業ディレクトリ。`${workspaceFolder}` 使用可 |
| `description` | — | 任意の説明文 |
| `variables` | — | 実行時に解決する変数定義。`name` と任意の `options` を持つ |
| `confirmBeforeRun` | — | `true` の場合、実行前に確認ダイアログを表示 |

`commands` の各要素は順番に実行され、途中で非 0 終了コードが返ると残りは実行されません。失敗しても続行したいコマンドは、使用するシェルに応じて成功終了に変換してください。例: sh/bash/zsh なら `some-command || true`。

---

## ライセンス

MIT

---

## 開発時の pre-push テスト

GitHub へ push する前にローカルで `npm test` を必須にしたい場合は、次を 1 回だけ実行します。

```bash
npm run setup:hooks
```

これで Git の `pre-push` フックとして `npm test` が実行され、失敗した場合は push が中断されます。
