// src/ai/adapters/OllamaNativeAdapter.ts

import { AIRuntimeAdapter } from '../../api/adapters/AIRuntimeAdapter';

export default class OllamaNativeAdapter {
  async executePrompt(params: {
    prompt: string;
    context?: Record<string, any>;
    stream?: boolean;
  }): Promise<{ chunks: AsyncIterable<string>; totalChars: number }> {
    const result = await AIRuntimeAdapter.ollamaChat({
      prompt: params.prompt,
      context: params.context,
      stream: params.stream ?? true,
    });

    if (result.status !== 'success' || !result.data?.response) {
      throw new Error(result.error || 'Fallo en ejecución de Ollama');
    }

    const fullText = result.data.response as string;
    const chunks = this.createStreamingChunks(fullText);

    return {
      chunks,
      totalChars: fullText.length,
    };
  }

  async cancelProcess(processId: string): Promise<void> {
    console.log(`[OllamaNativeAdapter] Solicitud de cancelación para processId: ${processId}`);
  }

  private async *createStreamingChunks(text: string): AsyncIterable<string> {
    const words = text.split(/\s+/);
    for (const word of words) {
      yield word + ' ';
      await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 80));
    }
  }
}