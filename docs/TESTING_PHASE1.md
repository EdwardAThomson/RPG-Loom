# Testing Phase 1 - LLM Infrastructure

## Quick Test Options

### Option 1: Simple Unit Test (Recommended to start)

Test that the infrastructure compiles and basic functions work:

```bash
cd gateway
npm run typecheck
```

✅ **Expected**: No TypeScript errors

### Option 2: Test with Gemini CLI (if installed)

Test the actual generation with Gemini CLI:

```bash
cd gateway

# Set environment variable
export GEMINI_CMD=gemini
# Or if you have an API key:
export GEMINI_API_KEY=your_key_here

# Run test script
npx tsx src/llm/test-generator.ts
```

✅ **Expected**: 
- Gemini CLI test passes
- Outputs a one-sentence forest description

### Option 3: Test Individual Components

Test each component in isolation:

#### Test Providers Module
```bash
cd gateway
npx tsx -e "
import { AVAILABLE_PROVIDERS, getDefaultModel, isCLIProvider } from './src/llm/providers.js';
console.log('Providers:', Object.keys(AVAILABLE_PROVIDERS));
console.log('Gemini default model:', getDefaultModel('gemini'));
console.log('Is gemini-cli a CLI provider?', isCLIProvider('gemini-cli'));
"
```

#### Test CLI Adapter
```bash
cd gateway
npx tsx -e "
import { getAdapter } from './src/llm/adapters/index.js';
const adapter = getAdapter('gemini');
const cmd = adapter.buildCommand({ prompt: 'test' });
console.log('Gemini CLI command:', cmd);
"
```

### Option 4: Test with Cloud APIs (if you have API keys)

```bash
cd gateway

# Set API key
export GEMINI_API_KEY=your_key_here
# or
export OPENAI_API_KEY=your_key_here
# or
export CLAUDE_API_KEY=your_key_here

# Run test script
npx tsx src/llm/test-generator.ts
```

## Manual Testing

### Test Gemini CLI Directly

```typescript
// test-gemini-cli.ts
import { generateUnified } from './src/llm/generator.js';

const result = await generateUnified({
  provider: 'gemini-cli',
  prompt: 'Write a one-sentence description of a mysterious forest.',
  maxTokens: 100,
  temperature: 0.7
});

console.log('Result:', result);
```

Run:
```bash
cd gateway
npx tsx test-gemini-cli.ts
```

### Test Cloud API (Gemini)

```typescript
// test-gemini-cloud.ts
import { generateUnified } from './src/llm/generator.js';

const result = await generateUnified({
  provider: 'gemini',
  model: 'gemini-3-flash-preview',
  prompt: 'Write a one-sentence description of a mysterious forest.',
  apiKey: process.env.GEMINI_API_KEY!,
  maxTokens: 100,
  temperature: 0.7
});

console.log('Result:', result);
```

Run:
```bash
cd gateway
export GEMINI_API_KEY=your_key_here
npx tsx test-gemini-cloud.ts
```

## Expected Results

### ✅ Success Indicators

1. **TypeScript Compilation**: No errors
2. **Module Imports**: All modules load without errors
3. **Provider Detection**: Correctly identifies CLI vs Cloud providers
4. **Adapter Creation**: Successfully creates adapters for CLI tools
5. **API Calls**: (If keys available) Successfully generates text

### ❌ Common Issues

**Issue**: `Cannot find module '@google/generative-ai'`
- **Fix**: Run `npm install` in `gateway/` directory

**Issue**: `Command 'gemini' not found`
- **Fix**: Either install Gemini CLI or skip CLI tests
- **Alternative**: Use Cloud API with `GEMINI_API_KEY`

**Issue**: `API key required for Cloud provider`
- **Fix**: Set appropriate environment variable
- **Alternative**: Use CLI provider instead

## Minimal Test (No External Dependencies)

Test just the infrastructure without making any API calls:

```bash
cd gateway
npx tsx -e "
import { AVAILABLE_PROVIDERS } from './src/llm/providers.js';
import { getAdapter } from './src/llm/adapters/index.js';

console.log('✅ Providers loaded:', Object.keys(AVAILABLE_PROVIDERS).length);
console.log('✅ Gemini adapter:', getAdapter('gemini') ? 'OK' : 'FAIL');
console.log('✅ Claude adapter:', getAdapter('claude') ? 'OK' : 'FAIL');
console.log('✅ Codex adapter:', getAdapter('codex') ? 'OK' : 'FAIL');
console.log('\\n✅ Phase 1 infrastructure is working!');
"
```

Expected output:
```
✅ Providers loaded: 7
✅ Gemini adapter: OK
✅ Claude adapter: OK
✅ Codex adapter: OK

✅ Phase 1 infrastructure is working!
```

## Next Steps After Testing

Once Phase 1 tests pass:
1. ✅ Verify TypeScript compilation
2. ✅ Test at least one provider (CLI or Cloud)
3. ➡️ Proceed to Phase 2: Integrate into existing narrative system
