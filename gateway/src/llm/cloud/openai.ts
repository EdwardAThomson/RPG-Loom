/**
 * OpenAI Cloud API Client
 * 
 * Client for OpenAI's API using the official SDK.
 */

import OpenAI from 'openai';

export interface OpenAIGenerateParams {
    model: string;
    prompt: string;
    apiKey: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Generate text using OpenAI API
 */
export async function generateWithOpenAI({
    model,
    prompt,
    apiKey,
    maxTokens,
    temperature
}: OpenAIGenerateParams): Promise<string> {
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature
    });

    return completion.choices[0]?.message?.content ?? '';
}
