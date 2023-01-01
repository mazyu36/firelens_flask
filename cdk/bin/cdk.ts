#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FirelensStack } from '../lib/firelensStack';


const app = new cdk.App();

const prefix: string = app.node.tryGetContext("prefix")

new FirelensStack(app, 'FirelensStack', {
  stackName: `${prefix}-FirelensStack`,
  prefix: prefix
});