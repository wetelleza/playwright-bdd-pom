export type Suite = 'demoqa' | 'saucedemo';

export const SUITES: Suite[] = ['demoqa', 'saucedemo'];

export type StepKeyword = 'Given' | 'When' | 'Then';

export interface StepDefinition {
  keyword: StepKeyword;
  pattern: string;
  sourceFile: string;
}

export interface GenerationResult {
  featureText: string;
  missingSteps: string[];
}

export type LocatorStrength = 'strong' | 'weak';

export interface DomElementSummary {
  tag: string;
  role: string | null;
  accessibleName: string | null;
  id: string | null;
  dataTest: string | null;
  placeholder: string | null;
  text: string | null;
  suggestedLocator: string;
  strength: LocatorStrength;
}

export interface PageObjectDefinition {
  className: string;
  fixtureName: string;
  filePath: string;
  methods: string[];
}

