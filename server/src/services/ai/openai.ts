import type { AiInput, AiProvider } from './types.js';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, endpoint?: string, model?: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint || process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
    this.model = model || process.env.AI_MODEL || 'gpt-4o-mini';
  }

  async generateResponse(input: AiInput): Promise<string> {
    const systemPrompt =
      'You are DevChamber’s intelligent programming tutor. Your goal is to guide students through discovery and deep conceptual understanding rather than directly giving full solutions. Provide concise, clear, and actionable feedback or hints. If debugging, pinpoint the invariant or assumption that failed.';

    let userPrompt = `Mode: ${input.mode || 'hint'}\nQuestion: ${input.question}`;
    if (input.context) {
      userPrompt += `\nCode Context:\n${input.context}`;
    }
    if (input.errorMessage) {
      userPrompt += `\nError Output:\n${input.errorMessage}`;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid or unauthorized API key for AI provider.');
        }
        if (response.status === 429) {
          throw new Error('AI provider rate limit reached. Please try again in a moment.');
        }
        throw new Error(`AI provider returned status ${response.status}`);
      }

      const data = (await response.json()) as {
        answer?: string;
        choices?: { message?: { content?: string } }[];
      };

      const reply = data.answer || data.choices?.[0]?.message?.content;
      if (!reply || reply.trim().length === 0) {
        throw new Error('Received empty response from AI provider.');
      }

      return reply.trim();
    } catch (err: any) {
      console.error('OpenAI Provider Error:', err?.message || err);
      throw new Error(err?.message || 'Error generating AI response.');
    }
  }
}
