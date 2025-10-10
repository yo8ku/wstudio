/**
 * AI 集成 API
 */

export interface AIRequest {
  prompt: string;
  model?: string;
  temperature?: number;
}

export interface AIResponse {
  text: string;
  model: string;
}

export async function complete(request: AIRequest): Promise<AIResponse> {
  return {
    text: 'AI response placeholder',
    model: request.model || 'default'
  };
}

export async function chat(messages: { role: string; content: string }[]): Promise<AIResponse> {
  return {
    text: 'Chat response placeholder',
    model: 'default'
  };
}



