type Input = {
  question: string;
  context?: string;
  mode: 'hint' | 'explain' | 'debug' | 'concept';
};

export async function assist(input: Input): Promise<string> {
  const endpoint = process.env.AI_API_URL;
  const key = process.env.AI_API_KEY;

  if (endpoint && key) {
    try {
      const systemPrompt =
        'You are DevChamber’s intelligent programming tutor. Your goal is to guide students through discovery and deep conceptual understanding rather than directly giving full solutions. Provide concise, clear, and actionable feedback or hints. If debugging, pinpoint the invariant or assumption that failed.';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Mode: ${input.mode}\nQuestion: ${input.question}\n${input.context ? `Code / Context:\n${input.context}` : ''}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          answer?: string;
          choices?: { message?: { content?: string } }[];
        };
        const reply = data.answer || data.choices?.[0]?.message?.content;
        if (reply) return reply;
      }
    } catch {
      // Fallback below
    }
  }

  // Pedagogical Intelligent Fallback
  const q = input.question.toLowerCase();
  const ctx = (input.context || '').toLowerCase();

  if (q.includes('binary search') || ctx.includes('binary_search')) {
    if (input.mode === 'hint') {
      return `💡 **Hint for Binary Search:**
1. Remember the loop invariant: the target, if it exists, is always within \`values[low...high]\`.
2. When \`values[middle] < target\`, all elements from \`0\` to \`middle\` are too small, so your next search range starts at \`low = middle + 1\`.
3. When \`values[middle] > target\`, all elements from \`middle\` to \`high\` are too big, so set \`high = middle - 1\`.
4. Check your termination condition: \`while low <= high:\` ensures you inspect single-element ranges.`;
    }
    if (input.mode === 'explain') {
      return `📚 **Binary Search Explanation:**
Binary Search is a divide-and-conquer algorithm with **O(log n)** time complexity and **O(1)** auxiliary space.
Each comparison cuts the remaining candidates in half. For an array of 1,000,000 items, binary search takes at most 20 comparisons!`;
    }
    if (input.mode === 'debug') {
      return `🔍 **Debugging Checklist:**
- Is the array guaranteed to be sorted before calling binary search?
- Are you calculating \`middle = (low + high) // 2\` using integer division?
- If experiencing an infinite loop, verify that \`low\` or \`high\` is strictly moving past \`middle\` (\`middle + 1\` or \`middle - 1\`).`;
    }
  }

  if (q.includes('recursion') || q.includes('base case')) {
    return `💡 **Recursion Guidance:**
Every recursive solution needs two parts:
1. **Base Case**: The simplest state where the answer is known without further calls.
2. **Recursive Step**: Moving strictly closer to the base case.
What is the smallest input your function could receive?`;
  }

  if (q.includes('time complexity') || q.includes('big o')) {
    return `⏱ **Complexity Tip:**
- Single loop over $n$ items: $O(n)$
- Halving the problem at each step: $O(\\log n)$
- Nested loops over $n$: $O(n^2)$
- Recursive tree with branching factor 2: $O(2^n)$`;
  }

  return `✨ **Learning Hint:**
Start by identifying what is known vs unknown:
1. What inputs does your code receive?
2. What exact state or return value is expected at the end?
3. Try tracing a 3-element test case by hand step-by-step.
*(Note: To connect an external LLM, configure \`AI_API_URL\` and \`AI_API_KEY\` in your \`.env\` file).*`;
}
