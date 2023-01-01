import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Container } from './constructs/container';
import { StackProps } from 'aws-cdk-lib';
import { DataInfra } from './constructs/dataInfra';
import { LogInfra } from './constructs/logInfra';

export interface FirelensStackProps extends StackProps {
  prefix: string,

}

export class FirelensStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FirelensStackProps) {
    super(scope, id, props);

    const logInfra = new LogInfra(this, 'LogInfra', { prefix: props.prefix })

    const container = new Container(this, 'Container', {
      prefix: props.prefix,
      firehoseStream: logInfra.firehoseStream
    })

    new DataInfra(this, 'DataInfra', {
      prefix: props.prefix,
      logBucket: logInfra.logBucket
    })
  }
}
