---
name: distribution-playbook
user-invocable: true
description: "VS Code 拡張の配布手順を標準化するスキル。『配布手順をまとめて』『リリース手順』『VSIX を作って配布したい』『publish 手順』『配布準備して』の依頼で使用。事前確認、ビルド、VSIX 生成、release notes 作成、git add、release notes ベースの commit、push、タグ作成、配布後チェックまでを順序立てて実施し、配布準備の実行が求められた場合は可能な範囲で実行まで行う。"
---

# Distribution Playbook Skill

## 目的

配布作業を再現可能な手順にし、リリース事故を防ぎます。

このスキルは、配布手順を説明するだけでなく、ユーザーが「配布準備して」「VSIX を作って」など実行を求めた場合には、可能な範囲で配布準備を実行します。

## 想定対象

- VSIX 配布
- Marketplace 公開前後の手順確認
- 配布準備の実行

## 実行方針

ユーザーが配布準備の実行を求めた場合は、説明だけで止めずに次を進めます。

1. 自動で進める範囲
- バージョン・差分・changelog / release notes の確認
- `npm run compile` などのビルド実行
- `vsce package` による VSIX 生成
- 生成物ファイル名と版数の確認
- README / CHANGELOG / release notes など関連ドキュメントの整合確認
- 更新不足のドキュメント修正
- VSIX と release notes 作成後の `git add -A`
- release notes の要約をもとにした commit 作成
- commit 後の push
- push 完了後のタグ作成

2. ユーザー確認が必要な範囲
- Marketplace 公開
- 認証情報やトークンが必要な処理

3. ブロック時の扱い
- `vsce` 未導入、認証不足、署名要件不足などで停止した場合は、止まった地点と不足条件を明示する
- 実行できたところまでの結果と、次に必要な手順を必ず返す

## 配布手順

1. 事前確認
- ブランチと差分を確認
- バージョンが確定していることを確認
- changelog / release notes の更新確認

2. ビルドと静的確認
- 依存関係が最新であることを確認
- `npm run compile` 実行
- 必要に応じて lint/test 実行

3. パッケージ作成
- `vsce package` で VSIX 生成
- 出力ファイル名のバージョンを確認（例: `local-terminal-actions-0.9.0.vsix`）
- `vsce` が無い場合は不足を明示し、導入手順または代替手段を案内

4. ドキュメント確認・更新
- README / CHANGELOG / `RELEASE_NOTES_<version>.md` / 配布手順書などの整合を確認
- 変更内容やバージョンが未反映なら更新する
- VSIX 名、バージョン表記、手順記載に不整合がないことを確認する

5. Git 反映
- VSIX と release notes 作成後に `git add -A` を実行
- `RELEASE_NOTES_<version>.md` の Summary / Highlights を要約して commit message を作成
- 例: `Release 0.9.0` または release notes に沿った要約 commit
- commit 実行後、現在ブランチへ push

6. ローカル検証
- VSIX をローカルインストール
- 主要機能のスモークテスト
  - ツリー表示
  - アクション実行
  - 設定編集（表示/動作/ファイル）

7. 公開処理
- push 完了後に Git タグ作成（例: `v0.9.0`）
- リリースノート反映
- Marketplace 公開（必要時）

8. 配布後確認
- Marketplace/配布先の版数確認
- ダウンロードした VSIX の版数確認
- 問い合わせ窓口用に既知の変更点を整理

## 出力テンプレート

- 対象バージョン: `x.y.z`
- 実行モード: 手順提示のみ / 配布準備を実行
- 実行コマンド:
  - `npm run compile`
  - `vsce package`
  - ドキュメント整合確認と必要更新
  - `git add -A`
  - `git commit -m "..."`
  - `git push`
  - `git tag vX.Y.Z`
- 生成物: `*.vsix`
- 検証結果: 成功/失敗
- 未完了タスク: なし/あり（内容）

## 注意事項

- 配布前に必ず再ビルドして再現性を確認
- 署名/公開トークンなどの機密情報をログへ出さない
- 配布手順書には環境依存値（ローカル絶対パス）を残さない
- ユーザーが配布準備の実行を求めている場合、実行可能な手順は自律的に進める
- commit message は `RELEASE_NOTES_<version>.md` の内容に沿って作成する
- タグは commit と push の完了後に作成する
