import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface LambdaResult<T> {
  status: number;
  body: T;
}

interface GenerateBody {
  featureText?: string;
  missingSteps?: string[];
  error?: string;
}

interface StepEntry {
  keyword: string;
  pattern: string;
  sourceFile: string;
}

interface CatalogBody {
  suite?: string;
  steps?: StepEntry[];
  error?: string;
}

/**
 * Thin wrapper around Playwright's APIRequestContext for the deployed Lambda + API Gateway
 * endpoint — same convention as ApiClient for the local tasks API. The API key is passed
 * explicitly per request (not baked into context-level headers) so negative tests can omit it.
 */
export class LambdaClient {
  private lastResult: LambdaResult<unknown> | null = null;

  constructor(
    private readonly request: APIRequestContext,
    private readonly apiKey: string,
  ) {}

  private headers(includeApiKey: boolean): Record<string, string> {
    return includeApiKey && this.apiKey ? { 'x-api-key': this.apiKey } : {};
  }

  private async toResult<T>(response: APIResponse): Promise<LambdaResult<T>> {
    const body = (await response.json().catch(() => null)) as T;
    const result = { status: response.status(), body };
    this.lastResult = result;
    return result;
  }

  async generate(
    description: string | undefined,
    suite: string,
    opts: { withApiKey?: boolean } = {},
  ): Promise<LambdaResult<GenerateBody>> {
    const data: Record<string, unknown> = { suite };
    if (description !== undefined) data.description = description;
    const response = await this.request.post('generate', {
      headers: this.headers(opts.withApiKey ?? true),
      data,
    });
    return this.toResult(response);
  }

  async catalog(suite?: string, opts: { withApiKey?: boolean } = {}): Promise<LambdaResult<CatalogBody>> {
    const query = suite ? `?suite=${encodeURIComponent(suite)}` : '';
    const response = await this.request.get(`catalog${query}`, {
      headers: this.headers(opts.withApiKey ?? true),
    });
    return this.toResult(response);
  }

  lastStatus(): number {
    if (!this.lastResult) throw new Error('No Lambda API call was made yet in this scenario');
    return this.lastResult.status;
  }

  lastBody<T>(): T {
    if (!this.lastResult) throw new Error('No Lambda API call was made yet in this scenario');
    return this.lastResult.body as T;
  }
}
