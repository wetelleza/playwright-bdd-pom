#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GenerateScenarioStack } from '../lib/generate-scenario-stack';

const app = new cdk.App();

new GenerateScenarioStack(app, 'GenerateScenarioStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
