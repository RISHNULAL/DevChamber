export type AiMode = 'hint' | 'explain' | 'debug' | 'concept' | 'summary' | 'practice';

export interface AiInput {
  question: string;
  context?: string;
  language?: string;
  errorMessage?: string;
  mode?: AiMode;
}

export interface AiProvider {
  readonly name: string;
  generateResponse(input: AiInput): Promise<string>;
}
