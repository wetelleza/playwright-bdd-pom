import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import type { Construct } from 'constructs';
import * as path from 'node:path';

/**
 * Serverless AI microservice: exposes the NL -> Gherkin generator (ai/generateScenarioCore.ts)
 * as POST /generate, plus a read-only GET /catalog for inspecting the live step catalog it
 * grounds against. `--implement-missing` deliberately stays out of Lambda's reach — it needs a
 * real, multi-minute browser session, the wrong execution model here.
 */
export class GenerateScenarioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY must be set in the environment before synthesizing this stack (see README).');
    }

    const fn = new lambda.Function(this, 'GenerateScenarioFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'dist')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ANTHROPIC_API_KEY: anthropicApiKey,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
      },
    });

    const api = new apigateway.RestApi(this, 'GenerateScenarioApi', {
      restApiName: 'playwright-bdd-pom-generate-scenario',
      deployOptions: { stageName: 'prod' },
    });

    const generate = api.root.addResource('generate');
    generate.addMethod('POST', new apigateway.LambdaIntegration(fn), { apiKeyRequired: true });

    const catalog = api.root.addResource('catalog');
    catalog.addMethod('GET', new apigateway.LambdaIntegration(fn), { apiKeyRequired: true });

    const apiKey = api.addApiKey('GenerateScenarioApiKey');
    const usagePlan = api.addUsagePlan('GenerateScenarioUsagePlan', {
      name: 'default',
      throttle: { rateLimit: 5, burstLimit: 10 },
      quota: { limit: 1000, period: apigateway.Period.MONTH },
    });
    usagePlan.addApiStage({ stage: api.deploymentStage });
    usagePlan.addApiKey(apiKey);

    // Base stage URL (e.g. https://xxxx.execute-api.us-east-1.amazonaws.com/prod/) — callers
    // append `generate` or `catalog`.
    new cdk.CfnOutput(this, 'ApiBaseUrl', { value: api.url });
    // The key's actual value isn't retrievable from a CFN output — resolve it at deploy time via
    // `aws apigateway get-api-key --api-key <ApiKeyId> --include-value` (see the deploy workflow).
    new cdk.CfnOutput(this, 'ApiKeyId', { value: apiKey.keyId });
  }
}
