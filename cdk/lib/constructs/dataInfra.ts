import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_glue as glue } from 'aws-cdk-lib';
import { aws_athena as athena } from 'aws-cdk-lib';

export interface DataInfraProps {
  prefix: string,
  logBucket: s3.Bucket
}

export class DataInfra extends Construct {
  constructor(scope: Construct, id: string, props: DataInfraProps) {
    super(scope, id);
    const accountId = cdk.Stack.of(scope).account;

    // Athenaのクエリ結果を出力するためのバケット
    const athenaQueryResultBucket = new s3.Bucket(scope, 'AthenaQueryResultBucket',
      {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        accessControl: s3.BucketAccessControl.PRIVATE,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED
      }
    );

    // Athenaのワークグループを作成。エンジンバージョンは3を指定。
    new athena.CfnWorkGroup(scope, 'AthenaWorkGroup', {
      name: `${props.prefix}-athenaWorkGroup`,
      workGroupConfiguration: {
        engineVersion: {
          selectedEngineVersion: 'Athena engine version 3',
        },
        resultConfiguration: {
          outputLocation: `s3://${athenaQueryResultBucket.bucketName}/result-data`,
        },
      },
      recursiveDeleteOption: true,
    });

    // Glue データベースを作成
    new glue.CfnDatabase(scope, 'GlueDatabase', {
      catalogId: accountId,
      databaseInput: {
        name: `${props.prefix}-log-database`,
      },
    });

    // Glue テーブルを作成
    // Partition Projectionを使用（dateでパーティション化）
    new glue.CfnTable(scope, "GlueTable", {
      databaseName: `${props.prefix}-log-database`, // Glueデータベースの名称と一致させる
      catalogId: accountId,
      tableInput: {
        name: `${props.prefix}-flask-log`,
        tableType: "EXTERNAL_TABLE",
        parameters: {
          "projection.enabled": true,
          "projection.date.type": "date",
          "projection.date.range": "2023/01/01, NOW+9HOUR",
          "projection.date.format": "yyyy/MM/dd",
          "projection.date.interval": "1",
          "projection.date.interval.unit": "DAYS",
          "serialization.encoding": "utf-8",
          "storage.location.template": `s3://${props.logBucket.bucketName}/ecs-logs/` + "${date}", // ecs-logsはKinesis Firehoseで指定したprefixと一致させている
        },
        storageDescriptor: {
          columns: [
            {
              "name": "container_id",
              "type": "string"
            },
            {
              "name": "container_name",
              "type": "string"
            },
            {
              "name": "ecs_cluster",
              "type": "string"
            },
            {
              "name": "ecs_task_arn",
              "type": "string"
            },
            {
              "name": "ecs_task_definition",
              "type": "string"
            },
            {
              "name": "log",
              "type": "string"
            },
            {
              "name": "source",
              "type": "string"
            },
            {
              "name": "time",
              "type": "string"
            }
          ],
          inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
          outputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
          serdeInfo: {
            serializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
          },
          location: `s3://${props.logBucket.bucketName}/ecs-logs`,
        },
        partitionKeys: [
          {
            "name": "date",
            "type": "string"
          },
        ]
      }
    })


  }
}