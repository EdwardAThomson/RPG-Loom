/**
 * Gemini Cloud API Client
 * 
 * Client for Google's Gemini API using the official SDK.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiGenerateParams {
    model: string;
    prompt: string;
    apiKey: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Generate text using Gemini Cloud API
 */
export async function generateWithGemini({
    model,
    prompt,
    apiKey,
    maxTokens,
    temperature
}: GeminiGenerateParams): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelInstance = genAI.getGenerativeModel({ model });

    const result = await modelInstance.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
        }
    });

    const response = result.response;
    return response.text();
}
