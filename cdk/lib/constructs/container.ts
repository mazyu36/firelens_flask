import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';
import { aws_ecs_patterns as ecsPatterns } from 'aws-cdk-lib';
import { aws_ecr as ecr } from 'aws-cdk-lib';
import { aws_kinesisfirehose as kinesisfirehose } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';

export interface ContainerProps {
  prefix: string,
  firehoseStream: kinesisfirehose.CfnDeliveryStream
}

export class Container extends Construct {
  constructor(scope: Construct, id: string, props: ContainerProps) {
    super(scope, id);

    // ECRリポジトリは事前に作成してイメージをプッシュしておく（Flask）
    const flaskRepository = ecr.Repository.fromRepositoryName(scope, "FlaskRepository", 'flask-repository');

    // 簡略化のためecsPatternsのものを使用
    const loadBalancedFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(scope, 'Service', {
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(flaskRepository, "latest"),
        logDriver: ecs.LogDrivers.firelens({}), // LogDriverでfirelensを指定
        containerPort: 5000
      },
    });

    // ヘルスチェックの設定
    loadBalancedFargateService.targetGroup.configureHealthCheck({
      path: '/health',
    });

    // Flaskのエラーログを流すCW Logsのロググループ
    const ecsLogGroup = new logs.LogGroup(scope, 'FlaskLog', {
      logGroupName: `${props.prefix}-flask-log`,
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //--------- Firelensに関する実装---------

    // ECRリポジトリは事前に作成してイメージをプッシュしておく（Firelens）
    const firelensRepository = ecr.Repository.fromRepositoryName(scope, "FirelensRepository", 'firelens-repository');

    // Firelensのログを流すCW Logsのロググループ
    const firelensLogGroup = new logs.LogGroup(scope, 'FirelensLog', {
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // タスク定義に対してFirelensのLogRouterを追加する。
    loadBalancedFargateService.taskDefinition.addFirelensLogRouter('logRouter', {
      image: ecs.ContainerImage.fromEcrRepository(firelensRepository, "latest"),
      essential: true, // trueにするとFirelensコンテナが死んだ場合、タスク自体を終了させる動作となる。
      healthCheck: { // Firelens自体のヘルスチェックの設定
        command: ["CMD-SHELL", "echo '{\"health\": \"check\"}' | nc 127.0.0.1 8877 || exit 1"],
        interval: cdk.Duration.minutes(3),
        retries: 3,
        startPeriod: cdk.Duration.minutes(3),
        timeout: cdk.Duration.seconds(30),
      },
      // Firelensのロググループを設定
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'firelens',
        logGroup: firelensLogGroup,
      }),
      // Firelensの設定ファイルの指定
      firelensConfig: {
        type: ecs.FirelensLogRouterType.FLUENTBIT,
        options: {
          configFileType: ecs.FirelensConfigFileType.FILE,
          configFileValue: '/fluent-bit/etc/extra.conf',
          enableECSLogMetadata: true
        }
      },
      // APログの出力先は環境依存のため、環境変数経由で渡す
      environment: {
        'LOG_GROUP_NAME': ecsLogGroup.logGroupName,
        'FIREHOSE_STREAM_NAME': props.firehoseStream.deliveryStreamName!
      },
    })

    // タスクロールに対してCW LogsとKinesis Firehoseへログを送るための権限を付与
    new iam.ManagedPolicy(scope, 'PolicyForFirelens', {
      description: 'Allows ecs send logs to CWLogs and Firehose',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogStream',
            'logs:CreateLogGroup',
            'logs:DescribeLogStreams',
            'logs:PutLogEvents',
            'logs:PutRetentionPolicy',
          ],
          resources: [ecsLogGroup.logGroupArn],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'firehose:PutRecordBatch'
          ],
          resources: [props.firehoseStream.attrArn],
        }),
      ],
      roles: [loadBalancedFargateService.taskDefinition.taskRole],
    });
  }
}