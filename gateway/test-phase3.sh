#!/bin/bash
# Test script for Phase 3 General-Purpose LLM Endpoints

set -e

echo "🧪 Testing Phase 3: General-Purpose LLM Endpoints"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: List Providers
echo "Test 1: GET /api/llm/providers"
echo "-------------------------------"
PROVIDERS=$(curl -s http://localhost:8787/api/llm/providers | jq -r '.providers | keys | join(", ")')
if [ -n "$PROVIDERS" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "   Providers: $PROVIDERS"
else
    echo -e "${RED}❌ FAILED${NC}"
    exit 1
fi
echo ""

# Test 2: Direct Generation (requires real provider)
echo "Test 2: POST /api/llm/generate"
echo "-------------------------------"

if [ -n "$GEMINI_API_KEY" ]; then
    echo "Testing with Gemini Cloud API..."
    RESPONSE=$(curl -s -X POST http://localhost:8787/api/llm/generate \
        -H "Content-Type: application/json" \
        -d '{
            "provider": "gemini",
            "model": "gemini-3-flash-preview",
            "prompt": "Write a one-sentence description of a mysterious forest.",
            "maxTokens": 100,
            "temperature": 0.7
        }')
    
    TEXT=$(echo "$RESPONSE" | jq -r '.text')
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    
    if [ "$TEXT" != "null" ] && [ -n "$TEXT" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "   Generated: $TEXT"
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Error: $ERROR"
        exit 1
    fi
elif command -v gemini &> /dev/null; then
    echo "Testing with Gemini CLI..."
    RESPONSE=$(curl -s -X POST http://localhost:8787/api/llm/generate \
        -H "Content-Type: application/json" \
        -d '{
            "provider": "gemini-cli",
            "model": "gemini-3-flash-preview",
            "prompt": "Write a one-sentence description of a mysterious forest.",
            "maxTokens": 100,
            "temperature": 0.7
        }')
    
    TEXT=$(echo "$RESPONSE" | jq -r '.text')
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    
    if [ "$TEXT" != "null" ] && [ -n "$TEXT" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "   Generated: $TEXT"
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Error: $ERROR"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  SKIPPED: No LLM provider available${NC}"
    echo "   Set GEMINI_API_KEY or install gemini CLI to test"
fi
echo ""

# Test 3: Validation
echo "Test 3: Request Validation"
echo "----------------------------"
RESPONSE=$(curl -s -X POST http://localhost:8787/api/llm/generate \
    -H "Content-Type: application/json" \
    -d '{"provider": "test"}')

ERROR=$(echo "$RESPONSE" | jq -r '.error')
if [ "$ERROR" != "null" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "   Validation working correctly"
else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Validation should have failed"
    exit 1
fi
echo ""

echo "================================================"
echo -e "${GREEN}✅ Phase 3 endpoints are working!${NC}"
echo ""
echo "Available endpoints:"
echo "  GET  /api/llm/providers - List available providers"
echo "  POST /api/llm/generate  - Direct LLM generation"
echo ""
