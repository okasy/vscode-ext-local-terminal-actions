---
name: version-bump
user-invocable: true
description: "拡張機能や npm パッケージのバージョン更新（patch/minor/major）時のチェックを標準化するスキル。『バージョンを上げる』『version bump』『マイナーバージョンを上げる』『リリース前チェック』の依頼で使用。package.json / package-lock.json / changelog / リリースノート / VSIX 名の整合確認、ビルド確認、変更点サマリー作成までを行う。"
---

# Version Bump Skill

## 目的

バージョン更新時の漏れを防ぎ、配布可能な状態まで一貫して確認します。

## 対象

- VS Code 拡張
- npm パッケージ

## 実施手順

1. 現在バージョンの検出
- `package.json` の `version`
- `package-lock.json` の `version`（ルートと `packages[""]`）
- `CHANGELOG.md` / `RELEASE_NOTES_*` / 配布物ファイル名の古いバージョン文字列

2. バージョン更新
- 指定された更新種別（patch/minor/major）で新バージョンを決定
- 少なくとも以下を更新
  - `package.json`
  - `package-lock.json`
- 必要に応じて更新
  - `CHANGELOG.md` の新見出し
  - `RELEASE_NOTES_<version>.md` の新規作成または既存追記
  - 旧バージョンを含む配布物名・記述

3. 整合チェック
- 旧バージョン文字列の残存検索を実施
- 新バージョンへ揃っていることを確認

4. ビルド/検証
- 既定のビルド（例: `npm run compile`）を実行
- エラーがあれば修正後に再実行

5. 報告
- 変更ファイル一覧
- 新旧バージョン
- 検証結果（成功/失敗）
- 次アクション（必要ならタグ作成や配布）

## チェックリスト

- [ ] `package.json` が更新済み
- [ ] `package-lock.json` が更新済み
- [ ] changelog/release notes の版数が整合
- [ ] 旧バージョン文字列の取りこぼしなし
- [ ] ビルド成功

## 注意事項

- ユーザーが明示しない限り、メジャー更新は行わない
- 既存の未関連差分を巻き戻さない
- バージョン更新と同時に不要なリファクタは混ぜない
