# 概要
AWS CDKを使用してECS on FargateにおいてFirelensを実装。

サンプルアプリとしてはPython(Flask)を使用して作成している。

Firelensによりログを以下の3つに分岐させている。

1. CloudWatch Logs：重要度が高いログ（エラーログ）のみ転送。
2. Firehose+S3：ヘルスチェック以外のログは全てS3に転送。Athenaでログ分析を行えるようGlueのデータベースおよびテーブルも作成する。
3. ゴミ箱：ALBのヘルスチェックログはどこにも出力せず捨てる。

![architecture](architecture.drawio.svg)

# 構成
```bash
.
├── cdk
│   ├── bin
│   └── lib
│       ├── constructs
│       │   ├── container.ts # ALB,ECSを定義
│       │   ├── dataInfra.ts # Glue, Athena関連を定義
│       │   └── logInfra.ts # Kinesis Firehose, ログ出力先のS3バケットを定義
│       └── firelensStack.ts
├── firelens  # Firelensのイメージ作成用の資材
│   ├── Dockerfile
│   └── extra.conf
└── flask # Flaskのイメージ作成用の資材
    ├── Dockerfile
    └── main.py
```


## サンプルアプリ（Flask）について
Firelensの動確用に以下5つのエンドポイントを用意している。

* `/info`：INFOログを出力するためのエンドポイント
* `/error`：ERRORログを出力するためのエンドポイント
* `/critical`：CRITICALログを出力するためのエンドポイント
* `/exception`：Exceptionを発生させるためのエンドポイント
* `/health`：ヘルスチェック用のエンドポイント

## Firelensについて
`ERROR`と`CRITICAL`はCloudWatch Logsに転送するように設定している。

# 使い方
FlaskとFirelensのイメージを格納するECRリポジトリを事前に作成し、Dockerイメージをpushしておく。リポジトリ名とタグはCDKの実装と一致している必要あり。

# デプロイ方法
`context`で`prefix`を指定してデプロイする（prefixをリソース名に付与することで複数環境で使用できるようにしている。）

```
cdk deploy -c prefix=test
```

# Athenaのクエリ例（prefixをtestとした場合）
デプロイ時に自動的にパーティションが作成されるようにしてある。`date`で指定すれば抽出範囲を限定可能。

```sql
SELECT
  time,
  log
FROM
  "test-log-database"."test-flask-log"
WHERE
  date = '2023/01/04';
```