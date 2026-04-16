# Local Terminal Actions

ターミナルで任意のコマンドをワンボタンで起動させられるようになる VS Code 拡張です。

登録したコマンドはプロジェクトの `.vscode/actions.json` に保存され、チームで共有できます。

---

## 機能

- **サイドバーに専用アイコン** – アクティビティバーに「Local Terminal Actions」アイコンが追加されます。
- **Actions ビュー** – 登録済みコマンドをセクション別のツリーで表示。クリックひとつで実行。
- **Setting ビュー** – コマンドの追加・編集・削除。タイトルバーの `＋` ボタンから 7 ステップのウィザードで登録。
- **プロジェクト共有** – `.vscode/actions.json` に保存されるため Git で共有可能。
- **ターミナルプロファイル選択** – bash / zsh / PowerShell など VS Code に登録されたプロファイルから選択。
- **ターミナル再利用** – セクション単位でターミナルを再利用するか、毎回新規作成するかを設定可能。
- **作業ディレクトリ** – コマンドごとに `cwd` を指定可能。`${workspaceFolder}` が使用できます。

---

## 使い方

### コマンドの登録

1. アクティビティバーの **Local Terminal Actions** アイコンをクリック。
2. **Setting** セクションで `＋`（Add Action）ボタンを押す。
3. 7 ステップのウィザードに従い、各項目を入力する。

| ステップ | 項目 | 説明 |
|---------|------|------|
| 1 | セクション | ツリーの枝名。既存から選択または新規入力 |
| 2 | アクション名 | 表示名（例: `Start services`） |
| 3 | コマンド | 実行するシェルコマンド（例: `docker compose up -d`） |
| 4 | ターミナルプロファイル | bash / zsh / PowerShell など |
| 5 | ターミナル再利用 | セクション単位で再利用 or 毎回新規作成 |
| 6 | 作業ディレクトリ | `${workspaceFolder}` が使用可能（省略でワークスペースルート） |
| 7 | 説明 | 任意のメモ |

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
  "actions": [
    {
      "id": "abc123-xyz",
      "section": "Docker",
      "name": "Start services",
      "command": "docker compose up -d",
      "terminalProfile": "bash",
      "reuseTerminal": true,
      "cwd": "${workspaceFolder}",
      "description": "Start all Docker Compose services in the background"
    }
  ]
}
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `id` | ✓ | 自動生成される一意の ID |
| `section` | ✓ | ツリーの枝名（グループ） |
| `name` | ✓ | アクションの表示名 |
| `command` | ✓ | 実行するシェルコマンド |
| `terminalProfile` | — | ターミナルプロファイル名 |
| `reuseTerminal` | — | `true`: セクション単位で再利用（既定）、`false`: 毎回新規 |
| `cwd` | — | 作業ディレクトリ。`${workspaceFolder}` 使用可 |
| `description` | — | 任意の説明文 |

---

## ライセンス

MIT
