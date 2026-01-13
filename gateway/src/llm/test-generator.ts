/**
 * Test Script for Phase 1 LLM Infrastructure
 * 
 * Tests the unified generator with different providers.
 * Run with: tsx gateway/src/llm/test-generator.ts
 */

import { generateUnified } from './generator.js';
import { AVAILABLE_PROVIDERS } from './providers.js';

// Test configuration
const TEST_PROMPT = 'Write a one-sentence description of a mysterious forest.';

async function testProvider(provider: string, apiKey?: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${provider}`);
    console.log('='.repeat(60));

    try {
        const startTime = Date.now();

        const result = await generateUnified({
            provider,
            prompt: TEST_PROMPT,
            apiKey,
            maxTokens: 100,
            temperature: 0.7
        });

        const duration = Date.now() - startTime;

        console.log(`✅ SUCCESS (${duration}ms)`);
        console.log(`\nResponse:\n${result}\n`);

        return true;
    } catch (error: any) {
        console.log(`❌ FAILED: ${error.message}\n`);
        return false;
    }
}

async function main() {
    console.log('🧪 Testing Phase 1 LLM Infrastructure\n');
    console.log(`Test Prompt: "${TEST_PROMPT}"\n`);

    const results: Record<string, boolean> = {};

    // Test Mock (should always work)
    console.log('\n📦 Testing Mock Provider (no external dependencies)');
    results['mock'] = await testProvider('mock');

    // Test CLI providers (if available)
    console.log('\n🖥️  Testing CLI Providers (requires CLI tools installed)');

    if (process.env.GEMINI_CMD || process.env.GEMINI_API_KEY) {
        results['gemini-cli'] = await testProvider('gemini-cli');
    } else {
        console.log('\n⏭️  Skipping gemini-cli (GEMINI_CMD not set)');
    }

    if (process.env.CLAUDE_CMD) {
        results['claude-cli'] = await testProvider('claude-cli');
    } else {
        console.log('\n⏭️  Skipping claude-cli (CLAUDE_CMD not set)');
    }

    if (process.env.CODEX_CMD) {
        results['codex'] = await testProvider('codex');
    } else {
        console.log('\n⏭️  Skipping codex (CODEX_CMD not set)');
    }

    // Test Cloud APIs (if API keys available)
    console.log('\n☁️  Testing Cloud API Providers (requires API keys)');

    if (process.env.GEMINI_API_KEY) {
        results['gemini'] = await testProvider('gemini', process.env.GEMINI_API_KEY);
    } else {
        console.log('\n⏭️  Skipping gemini (GEMINI_API_KEY not set)');
    }

    if (process.env.OPENAI_API_KEY) {
        results['openai'] = await testProvider('openai', process.env.OPENAI_API_KEY);
    } else {
        console.log('\n⏭️  Skipping openai (OPENAI_API_KEY not set)');
    }

    if (process.env.CLAUDE_API_KEY) {
        results['claude'] = await testProvider('claude', process.env.CLAUDE_API_KEY);
    } else {
        console.log('\n⏭️  Skipping claude (CLAUDE_API_KEY not set)');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));

    const tested = Object.keys(results);
    const passed = tested.filter(p => results[p]);
    const failed = tested.filter(p => !results[p]);

    console.log(`\nTested: ${tested.length} providers`);
    console.log(`✅ Passed: ${passed.length} - ${passed.join(', ') || 'none'}`);
    console.log(`❌ Failed: ${failed.length} - ${failed.join(', ') || 'none'}`);

    console.log('\n💡 Available Providers:');
    Object.entries(AVAILABLE_PROVIDERS).forEach(([id, info]) => {
        const status = results[id] === true ? '✅' : results[id] === false ? '❌' : '⏭️';
        console.log(`  ${status} ${id} (${info.type}) - ${info.models.length} models`);
    });

    console.log('\n');
    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
