import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface ApiResult<T> {
  status: number;
  body: T;
}

interface TaskBody {
  id?: number;
  title?: string;
  done?: boolean;
  error?: string;
}

/**
 * Thin wrapper around Playwright's APIRequestContext — the API-testing equivalent of a Page
 * Object. Steps call these methods instead of making raw request.* calls, same convention as
 * the UI Page Objects (no protocol details leaking into step definitions).
 *
 * Keeps the last response and last created task id as internal state (same pattern
 * AlertsModalsPage already uses for the last dialog message) so steps can be written as short,
 * readable sentences ("the response status is 201") instead of threading return values by hand.
 */
export class ApiClient {
  private token: string | null = null;
  private lastResult: ApiResult<unknown> | null = null;
  private lastTaskId: number | null = null;

  constructor(private readonly request: APIRequestContext) {}

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async toResult<T>(response: APIResponse): Promise<ApiResult<T>> {
    const body = (await response.json().catch(() => null)) as T;
    const result = { status: response.status(), body };
    this.lastResult = result;
    return result;
  }

  async login(username: string, password: string): Promise<ApiResult<{ token?: string; error?: string }>> {
    const response = await this.request.post('/auth/login', { data: { username, password } });
    const result = await this.toResult<{ token?: string; error?: string }>(response);
    if (result.body?.token) this.token = result.body.token;
    return result;
  }

  clearToken(): void {
    this.token = null;
  }

  async listTasks(): Promise<ApiResult<TaskBody[]>> {
    const response = await this.request.get('/tasks', { headers: this.authHeaders() });
    return this.toResult(response);
  }

  async createTask(title?: string): Promise<ApiResult<TaskBody>> {
    const response = await this.request.post('/tasks', { headers: this.authHeaders(), data: { title } });
    const result = await this.toResult<TaskBody>(response);
    if (result.body?.id) this.lastTaskId = result.body.id;
    return result;
  }

  async getTask(id: number): Promise<ApiResult<TaskBody>> {
    const response = await this.request.get(`/tasks/${id}`, { headers: this.authHeaders() });
    return this.toResult(response);
  }

  async getLastCreatedTask(): Promise<ApiResult<TaskBody>> {
    return this.getTask(this.requireLastTaskId());
  }

  async updateTask(id: number, patch: { title?: string; done?: boolean }): Promise<ApiResult<TaskBody>> {
    const response = await this.request.put(`/tasks/${id}`, { headers: this.authHeaders(), data: patch });
    return this.toResult(response);
  }

  async updateLastCreatedTask(patch: { title?: string; done?: boolean }): Promise<ApiResult<TaskBody>> {
    return this.updateTask(this.requireLastTaskId(), patch);
  }

  async deleteTask(id: number): Promise<ApiResult<null>> {
    const response = await this.request.delete(`/tasks/${id}`, { headers: this.authHeaders() });
    return this.toResult(response);
  }

  async deleteLastCreatedTask(): Promise<ApiResult<null>> {
    return this.deleteTask(this.requireLastTaskId());
  }

  lastStatus(): number {
    if (!this.lastResult) throw new Error('No API call was made yet in this scenario');
    return this.lastResult.status;
  }

  lastBody<T>(): T {
    if (!this.lastResult) throw new Error('No API call was made yet in this scenario');
    return this.lastResult.body as T;
  }

  private requireLastTaskId(): number {
    if (this.lastTaskId === null) throw new Error('No task was created yet in this scenario');
    return this.lastTaskId;
  }
}
