# Release Notes 0.8.0

推奨タグ: v0.8.0

## Summary

0.8.0 では、設定 UI を整理し、アクション管理とセクション管理を改善しました。

## Highlights

- Setting ビューを一般設定用と Edit Actions 用の 2 ビューに分割
- Edit Actions ビューでアクションとセクションのドラッグ&ドロップ並び替えに対応
- セクション名変更に対応
- actions.json をエディターで直接開くコマンドを追加
- 新規追加 4 ステップ、編集 9 ステップのウィザード構成を README と実装で整合

## User Impact

- 日常操作では Actions ビューからそのまま実行しやすくなりました
- 設定系操作は Setting ビュー、並び替えや編集は Edit Actions ビューに分離され、目的別に操作しやすくなりました
- セクション単位の整理がしやすくなり、actions.json の直接確認も容易になりました

## Package

- VSIX: local-terminal-actions-0.8.0.vsix
