import { GoogleGenAI } from '@google/genai';
import type { AiInput, AiProvider } from './types.js';

const SYSTEM_INSTRUCTION = `You are DevChamber's AI Learning Assistant, an expert, encouraging programming tutor and teaching assistant.

Your purpose is to help students deeply understand computer science concepts, algorithms, data structures, and debugging.

Pedagogical Guidelines:
1. Concept Explanations: Explain core principles with clear intuition, simple analogies, and concise examples. Break down complex topics into digestible steps.
2. Debugging & Error Analysis: When diagnosing bugs (such as IndexError, TypeError, infinite loops, boundary issues), identify the underlying flawed assumption or invariant. Explain *why* it occurs and guide the student with targeted hints.
3. Socratic Guidance: When appropriate (especially in 'hint' or 'debug' mode), guide students toward finding the solution themselves rather than immediately dumping complete solutions.
4. Code Quality & Invariants: Highlight edge cases, loop bounds, and Big-O time/space complexity when relevant.
5. Markdown Formatting: Use clear Markdown with backticks for code symbols and syntax-highlighted code blocks. Keep tone warm, constructive, and concise.`;

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new GoogleGenAI({ apiKey });
    const configured = (model || process.env.AI_MODEL || '').trim();
    if (!configured || configured.startsWith('gpt-') || configured.includes('openai')) {
      this.model = 'gemini-3.1-flash-lite';
    } else {
      this.model = configured;
    }
  }

  async generateResponse(input: AiInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    const candidateModels = Array.from(
      new Set([this.model, 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'])
    );

    let lastError: any = null;

    for (const modelName of candidateModels) {
      // Try up to 3 attempts for transient spikes
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AI request timed out after 30 seconds')), 30_000);
          });

          const generatePromise = this.client.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              temperature: 0.4,
              maxOutputTokens: 1200,
            },
          });

          const response = await Promise.race([generatePromise, timeoutPromise]);

          const text = response?.text;
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || err || '');
          console.warn(`[Gemini Provider] Model ${modelName} (attempt ${attempt}/3) returned:`, msg);

          // Fatal auth error -> stop immediately
          if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('401') || msg.includes('403')) {
            break;
          }

          // If 404 (model not found) -> don't retry same model
          if (msg.includes('404') || msg.includes('NOT_FOUND')) {
            break;
          }

          // If 503 / UNAVAILABLE / high demand, wait with backoff before retry
          if (attempt < 3 && (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE'))) {
            await new Promise((r) => setTimeout(r, attempt * 1200));
            continue;
          }
        }
      }
    }

    const message = String(lastError?.message || lastError || '');
    if (message.includes('API_KEY_INVALID') || message.includes('API key not valid') || message.includes('401') || message.includes('403')) {
      throw new Error('Invalid or unauthorized Gemini API key. Please check your AI_API_KEY configuration.');
    }
    if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429') || message.includes('quota')) {
      throw new Error('Gemini API rate limit or quota exceeded. Please wait a moment and try again.');
    }
    if (message.includes('503') || message.includes('high demand') || message.includes('UNAVAILABLE')) {
      throw new Error('Gemini is currently experiencing high demand. Please try again in a few moments.');
    }
    if (message.includes('timed out')) {
      throw new Error('The AI assistant request timed out. Please try asking again.');
    }
    if (message.includes('FetchError') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('network')) {
      throw new Error('Network error connecting to Gemini API. Please check server internet connectivity.');
    }

    console.error('Gemini Provider Fatal Error:', message);
    throw new Error('Gemini AI assistant encountered an error generating the response.');
  }

  private buildPrompt(input: AiInput): string {
    const parts: string[] = [];

    if (input.mode) {
      parts.push(`[Mode: ${input.mode.toUpperCase()}]`);
    }
    if (input.language) {
      parts.push(`[Language: ${input.language}]`);
    }

    parts.push(`Student Question:\n${input.question.trim()}`);

    if (input.context && input.context.trim()) {
      parts.push(`\nCurrent Code in Editor:\n\`\`\`${input.language || ''}\n${input.context.trim()}\n\`\`\``);
    }

    if (input.errorMessage && input.errorMessage.trim()) {
      parts.push(`\nError / Execution Output:\n\`\`\`\n${input.errorMessage.trim()}\n\`\`\``);
    }

    return parts.join('\n\n');
  }
}
