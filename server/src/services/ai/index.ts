import type { AiInput, AiProvider } from './types.js';
import { GeminiProvider } from './gemini.js';
import { OpenAiProvider } from './openai.js';

export type { AiInput, AiMode, AiProvider } from './types.js';

function getProvider(): AiProvider | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const providerType = (process.env.AI_PROVIDER || 'gemini').toLowerCase().trim();
  const model = process.env.AI_MODEL?.trim();

  switch (providerType) {
    case 'gemini':
      return new GeminiProvider(apiKey, model);
    case 'openai':
      return new OpenAiProvider(apiKey, process.env.AI_API_URL?.trim(), model);
    default:
      // Fall back to Gemini
      return new GeminiProvider(apiKey, model);
  }
}

export async function assist(input: AiInput): Promise<string> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    return 'AI assistant is not configured yet.';
  }

  const provider = getProvider();
  if (!provider) {
    return 'AI assistant is not configured yet.';
  }

  try {
    return await provider.generateResponse(input);
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to generate response.';
    // Ensure no API keys or internal stack traces are returned to client
    console.error(`[AI Service Error] [${provider.name}]:`, errorMsg);
    return errorMsg;
  }
}
