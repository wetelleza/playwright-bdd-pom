import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { captureCandidateElements } from './domProbe';
import type { DomElementSummary } from './types';

export const PROBE_MARKER = '__AI_PROBE__';

const PROBE_DIR = join(process.cwd(), 'ai', '.probe');

export class ProbeCaptured extends Error {
  constructor(public readonly probeId: string) {
    super(`${PROBE_MARKER}:${probeId}`);
    this.name = 'ProbeCaptured';
  }
}

function probeFilePath(probeId: string): string {
  return join(PROBE_DIR, `${probeId}.json`);
}

/**
 * Called from a temporary "probe" method inserted into a real Page Object: captures the DOM
 * at the exact point in the flow where a selector is needed, and stops execution with a
 * recognizable error (`ProbeCaptured`) so the orchestrator can tell it apart from a real failure.
 */
export async function captureProbe(page: Page, probeId: string): Promise<never> {
  const digest = await captureCandidateElements(page);
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(probeFilePath(probeId), JSON.stringify(digest, null, 2), 'utf-8');
  throw new ProbeCaptured(probeId);
}

export function readProbe(probeId: string): DomElementSummary[] {
  const raw = readFileSync(probeFilePath(probeId), 'utf-8');
  return JSON.parse(raw) as DomElementSummary[];
}
