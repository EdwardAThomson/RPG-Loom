/**
 * Claude Cloud API Client
 * 
 * Client for Anthropic's Claude API using the official SDK.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeGenerateParams {
    model: string;
    prompt: string;
    apiKey: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Generate text using Claude API
 */
export async function generateWithClaude({
    model,
    prompt,
    apiKey,
    maxTokens,
    temperature
}: ClaudeGenerateParams): Promise<string> {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
        model,
        max_tokens: maxTokens ?? 1024,
        temperature,
        messages: [{ role: 'user', content: prompt }]
    });

    // Extract text from the first content block
    const firstBlock = message.content[0];
    return firstBlock?.type === 'text' ? firstBlock.text : '';
}
