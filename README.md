# Terminal Actions

[![Version](https://img.shields.io/visual-studio-marketplace/v/okasy.local-terminal-actions?label=Version)](https://marketplace.visualstudio.com/items?itemName=okasy.local-terminal-actions)

ターミナルで任意のコマンドをワンボタンで起動させられるようになる VS Code 拡張です。

登録したコマンドはプロジェクトの `.vscode/actions.json` に保存され、チームで共有できます。

Marketplace: https://marketplace.visualstudio.com/items?itemName=okasy.local-terminal-actions

---

## インストール

- VS Code Marketplace からインストール:
  https://marketplace.visualstudio.com/items?itemName=okasy.local-terminal-actions
- VS Code のクイックオープン（`Cmd+P`）で次を実行:
  `ext install okasy.local-terminal-actions`

---

## 機能

- **サイドバーに専用アイコン** – アクティビティバーに「Terminal Actions」アイコンが追加されます。
- **Actions ビュー** – 登録済みコマンドをセクション別のツリーで表示。クリックひとつで実行。
- **Setting ビュー** – コマンドの追加・編集・削除。タイトルバーの `＋` ボタンから 7 ステップのウィザードで登録。
- **プロジェクト共有** – `.vscode/actions.json` に保存されるため Git で共有可能。
- **ターミナルプロファイル選択** – bash / zsh / PowerShell など VS Code に登録されたプロファイルから選択。
- **ターミナル再利用** – セクション単位でターミナルを再利用するか、毎回新規作成するかを設定可能。
- **作業ディレクトリ** – コマンドごとに `cwd` を指定可能。`${workspaceFolder}` が使用できます。
- **起動パラメータ変数** – コマンド中の `${name}` に対して、実行時に値を入力または選択できます。
- **実行前確認** – アクションごとに、実行前の確認ダイアログを必須化できます。
- **Add new は簡易入力** – 新規追加時は基本項目のみ表示し、複雑な設定は編集時に行えます。

---

## 使い方

### コマンドの登録

1. アクティビティバーの **Terminal Actions** アイコンをクリック。
2. **Setting** セクションで `＋`（Add Action）ボタンを押す。
3. Add new では 4 ステップの基本項目を入力する。

| ステップ | 項目 | 説明 |
|---------|------|------|
| 1 | セクション | ツリーの枝名。既存から選択または新規入力 |
| 2 | アクション名 | 表示名（例: `Start services`） |
| 3 | コマンド | 実行するシェルコマンド（例: `docker compose up -d`） |
| 4 | 説明 | 任意のメモ |

高度な設定（編集時）:

- ターミナルプロファイル
- ターミナル再利用
- 作業ディレクトリ
- 変数定義（例: `target=ingame|outgame|admin|*`）
- 実行前確認の有無

### コマンドの実行

- **Actions** ビューのアクション名をクリック、または右クリック → **Run Action**。
- インラインの `▶` ボタンでも実行できます。

### コマンドの編集・削除

- **Setting** ビューのアクション名をクリック → 編集ウィザードが開きます。
- 右クリック → **Edit Action** / **Delete Action**。
- インラインの `✏` / `🗑` ボタンを使用することもできます。

---

## actions.json の形式

```json
{
  "sections": [
    "Docker"
  ],
  "actions": [
    {
      "id": "abc123-xyz",
      "section": "Docker",
      "name": "Start services",
      "command": "docker compose up -d",
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
|-----------|------|------|
| `sections` | — | セクションの表示順。省略時は `actions` から自動推定 |
| `id` | ✓ | 自動生成される一意の ID |
| `section` | ✓ | ツリーの枝名（グループ） |
| `name` | ✓ | アクションの表示名 |
| `command` | ✓ | 実行するシェルコマンド |
| `terminalProfile` | — | ターミナルプロファイル名 |
| `reuseTerminal` | — | `true`: セクション単位で再利用（既定）、`false`: 毎回新規 |
| `cwd` | — | 作業ディレクトリ。`${workspaceFolder}` 使用可 |
| `description` | — | 任意の説明文 |
| `variables` | — | 実行時に解決する変数定義。`name` と任意の `options` を持つ |
| `confirmBeforeRun` | — | `true` の場合、実行前に確認ダイアログを表示 |

---

## ライセンス

MIT
