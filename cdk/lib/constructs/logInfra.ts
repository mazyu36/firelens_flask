import { Construct } from 'constructs';
import { aws_kinesisfirehose as kinesisfirehose } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';

export interface LogInfraProps {
  prefix: string
}

export class LogInfra extends Construct {
  public readonly logBucket: s3.Bucket
  public readonly firehoseStream: kinesisfirehose.CfnDeliveryStream
  constructor(scope: Construct, id: string, props: LogInfraProps) {
    super(scope, id);

    const region = cdk.Stack.of(scope).region;
    const accountId = cdk.Stack.of(scope).account;

    // ECSのログを配信するためのバケット
    this.logBucket = new s3.Bucket(scope, 'LogBucket', {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED
    })

    // Kinesis Firehoseで配信失敗時にログを出力するロググループ
    const deliveryStreamFailLogGroup = new logs.LogGroup(
      scope,
      "DeliveryStreamFailLogGroup",
      {
        logGroupName: `/aws/kinesisfirehose/${props.prefix}-stream-fail-log`,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }
    );

    new logs.LogStream(scope, "DeliveryStreamLogStream", {
      logGroup: deliveryStreamFailLogGroup,
      logStreamName: "logs",
    });

    const deliveryStreamRole = new iam.Role(scope, "DeliveryStreamRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
    });

    deliveryStreamRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "kinesis:DescribeStream",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
        ],
        effect: iam.Effect.ALLOW,
        resources: [`arn:aws:kinesis:${region}:${accountId}:stream/*`],
      })
    );

    deliveryStreamRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject",
        ],
        effect: iam.Effect.ALLOW,
        resources: [
          this.logBucket.bucketArn,
          `${this.logBucket.bucketArn}/*`,
        ],
      })
    );

    deliveryStreamRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:PutLogEvents"],
        effect: iam.Effect.ALLOW,
        resources: [
          `arn:aws:logs:${region}:${accountId}:log-group:/aws/kinesisfirehose/*`,
        ],
      })
    );


    this.firehoseStream = new kinesisfirehose.CfnDeliveryStream(scope, 'FirehoseStream',
      {
        deliveryStreamName: `${props.prefix}-firehose-stream`,
        deliveryStreamType: 'DirectPut',
        s3DestinationConfiguration: {
          bucketArn: this.logBucket.bucketArn,
          prefix: 'ecs-logs/',
          roleArn: deliveryStreamRole.roleArn,
          bufferingHints: {
            intervalInSeconds: 300,
            sizeInMBs: 5
          },
          compressionFormat: 'GZIP',
          errorOutputPrefix: "errorOutput",
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: deliveryStreamFailLogGroup.logGroupName,
            logStreamName: "logs",
          }
        },
      }
    )



  }
}