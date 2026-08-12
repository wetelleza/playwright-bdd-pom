export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

export interface FlatResult {
  title: string;
  file: string;
  project: string;
  suite: 'demoqa' | 'saucedemo' | 'api' | 'other';
  status: TestStatus;
  durationMs: number;
  errorMessage: string | null;
}

export interface GroupStat {
  label: string;
  total: number;
  passed: number;
  passRate: number;
}

export interface ExecutiveSummary {
  generatedAt: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  passRate: number;
  durationMs: number;
  bySuite: GroupStat[];
  byBrowser: GroupStat[];
  failures: FlatResult[];
}
