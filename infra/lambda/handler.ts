import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Anthropic from '@anthropic-ai/sdk';
import { generateScenarioCore } from '../../ai/generateScenarioCore';
import { extractStepCatalog } from '../../ai/stepCatalog';
import { SUITES, type Suite } from '../../ai/types';

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

interface GenerateRequestBody {
  description?: unknown;
  suite?: unknown;
}

/**
 * The Lambda equivalent of `npm run ai:generate` (without --implement-missing — that needs a
 * real, multi-minute browser session, the wrong execution model here). Same anti-hallucination
 * grounding as the CLI, via the shared ai/generateScenarioCore.ts — nothing duplicated.
 */
async function handleGenerate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: GenerateRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { error: 'Request body must be valid JSON' });
  }

  const { description, suite } = body;
  if (typeof description !== 'string' || !description.trim()) {
    return json(400, { error: '"description" is required and must be a non-empty string' });
  }
  if (typeof suite !== 'string' || !SUITES.includes(suite as Suite)) {
    return json(400, { error: `"suite" is required and must be one of: ${SUITES.join(', ')}` });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Missing ANTHROPIC_API_KEY environment variable');
    return json(500, { error: 'Server misconfiguration' });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const result = await generateScenarioCore({
      description,
      suite: suite as Suite,
      anthropic,
      model: process.env.ANTHROPIC_MODEL,
    });
    return json(200, { featureText: result.featureText, missingSteps: result.missingLines });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Failed to generate the scenario' });
  }
}

// Read-only and free (no Claude call) — lets a client inspect which steps already exist before
// calling /generate, using the same live catalog generateScenarioCore grounds against.
function handleCatalog(event: APIGatewayProxyEvent): APIGatewayProxyResult {
  const suite = event.queryStringParameters?.suite;
  if (typeof suite !== 'string' || !SUITES.includes(suite as Suite)) {
    return json(400, { error: `"suite" query parameter is required and must be one of: ${SUITES.join(', ')}` });
  }

  try {
    const steps = extractStepCatalog(suite as Suite);
    return json(200, { suite, steps });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Failed to read the step catalog' });
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'GET' && event.resource === '/catalog') {
    return handleCatalog(event);
  }
  if (event.httpMethod === 'POST' && event.resource === '/generate') {
    return handleGenerate(event);
  }
  return json(404, { error: 'Not found' });
}
