# Release Notes 0.10.1

推奨タグ: v0.10.1

## Summary

0.10.1 では、actions.json の旧形式を現行形式へ移行するマイグレーションを配布版に反映し、手動調整コマンドでも同じ移行が走るように修正しました。

## Highlights

- 拡張起動時の actions.json 自動マイグレーションを配布版へ反映
- `.vscode/actions.json` の作成・調整コマンドでも旧形式から現行形式へのマイグレーションを実行

## User Impact

- 0.10.0 から更新した環境でも、旧 `command` 形式の設定が起動時に `commands` 形式へ移行されます
- 自動移行が反映されていない環境でも、設定ファイルの作成・調整コマンドを実行すれば同じ移行を適用できます
- 旧形式の actions.json を手元で編集していたワークスペースでも、移行経路が起動時と手動調整時で一致します

## Package

- VSIX: local-terminal-actions-0.10.1.vsix
