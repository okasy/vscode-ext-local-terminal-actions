# Release Notes 0.9.2

推奨タグ: v0.9.2

## Summary

0.9.2 では、新規ターミナル起動時に自動実行するコマンドと、起動後の待機時間を設定できる機能を追加しました。

## Highlights

- アクションごとに新規ターミナル起動時コマンド（`onNewTerminalCommand`）を設定可能に
- 全アクション共通の新規ターミナル起動時コマンド（`commonOnNewTerminalCommand`）を設定可能に
- 新規ターミナル起動後の遅延秒数（`newTerminalDelaySeconds`）を設定可能に
- `localTerminalActions.editNewTerminalDelaySeconds` コマンドを追加

## User Impact

- ターミナル起動直後に初期化コマンド（例: `cd ~/project` など）を自動実行できるようになりました
- 起動直後の遅延を調整することで、シェルの初期化完了を待ってからコマンドを送れるようになりました
- 全アクション共通の設定と個別設定を使い分けることで、柔軟な構成が可能になりました

## Package

- VSIX: local-terminal-actions-0.9.2.vsix
