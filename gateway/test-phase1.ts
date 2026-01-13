#!/usr/bin/env tsx
/**
 * Simple test to verify Phase 1 infrastructure
 * Run with: npm run test:phase1
 */

import { AVAILABLE_PROVIDERS } from './src/llm/providers';
import { getAdapter } from './src/llm/adapters';

console.log('\n🧪 Testing Phase 1 LLM Infrastructure\n');

// Test 1: Providers loaded
const providerCount = Object.keys(AVAILABLE_PROVIDERS).length;
console.log(`✅ Providers loaded: ${providerCount}`);
console.log(`   Available: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}\n`);

// Test 2: CLI Adapters
console.log('Testing CLI Adapters:');
const geminiAdapter = getAdapter('gemini');
console.log(`  ✅ Gemini adapter: ${geminiAdapter ? 'OK' : 'FAIL'}`);

const claudeAdapter = getAdapter('claude');
console.log(`  ✅ Claude adapter: ${claudeAdapter ? 'OK' : 'FAIL'}`);

const codexAdapter = getAdapter('codex');
console.log(`  ✅ Codex adapter: ${codexAdapter ? 'OK' : 'FAIL'}`);

// Test 3: Adapter command building
if (geminiAdapter) {
    console.log('\nTesting Gemini adapter command building:');
    const cmd = geminiAdapter.buildCommand({ prompt: 'test prompt' });
    console.log(`  Command: ${cmd.command}`);
    console.log(`  Args: ${cmd.args.join(' ')}`);
    console.log(`  Format: ${cmd.responseFormat}`);
}

console.log('\n✅ Phase 1 infrastructure is working!\n');
console.log('Next steps:');
console.log('  1. Test with actual Gemini CLI: export GEMINI_CMD=gemini && npx tsx gateway/src/llm/test-generator.ts');
console.log('  2. Or proceed to Phase 2: Integrate into narrative system\n');
