/**
 * OpenAI Embedding 提供者
 */

import OpenAI from 'openai';
import { EmbeddingProvider } from '../EmbeddingProvider';
import { EmbeddingResult, BatchEmbeddingResult, EmbeddingOptions } from '../types';

export class OpenAIEmbedding extends EmbeddingProvider {
  private client: OpenAI;

  constructor(config: { apiKey: string; model?: string; dimensions?: number }) {
    super({
      name: 'openai',
      model: config.model || 'text-embedding-3-small',
      dimensions: config.dimensions || 1536,
      batchSize: 100,
      ...config,
    });

    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.config.model!,
      input: text,
    });

    let embedding = response.data[0].embedding;

    if (options?.normalize) {
      embedding = this.normalize(embedding);
    }

    return {
      embedding,
      model: this.config.model!,
      dimensions: this.config.dimensions!,
    };
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.config.model!,
      input: texts,
    });

    let embeddings = response.data.map((item) => item.embedding);

    if (options?.normalize) {
      embeddings = embeddings.map((emb) => this.normalize(emb));
    }

    return {
      embeddings,
      model: this.config.model!,
      dimensions: this.config.dimensions!,
    };
  }
}



















