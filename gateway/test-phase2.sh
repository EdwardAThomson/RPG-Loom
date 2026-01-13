#!/bin/bash
# Test script for Phase 2 LLM Integration
# Tests the narrative task system with different providers

set -e

echo "🧪 Testing Phase 2: Multi-Provider Narrative System"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test a provider
test_provider() {
    local PROVIDER=$1
    local MODEL=$2
    local TEST_NAME=$3
    
    echo -e "${YELLOW}Testing: ${TEST_NAME}${NC}"
    
    # Build JSON payload conditionally including model
    if [ -n "$MODEL" ]; then
        JSON_PAYLOAD="{
            \"type\": \"quest_flavor\",
            \"backendId\": \"${PROVIDER}\",
            \"model\": \"${MODEL}\",
            \"references\": {\"locationId\": \"forest\"},
            \"facts\": {\"enemyType\": \"wolves\", \"quantity\": 5}
        }"
    else
        JSON_PAYLOAD="{
            \"type\": \"quest_flavor\",
            \"backendId\": \"${PROVIDER}\",
            \"references\": {\"locationId\": \"forest\"},
            \"facts\": {\"enemyType\": \"wolves\", \"quantity\": 5}
        }"
    fi
    
    # Create task
    RESPONSE=$(curl -s -X POST http://localhost:8787/api/tasks \
        -H "Content-Type: application/json" \
        -d "$JSON_PAYLOAD")
    
    TASK_ID=$(echo "$RESPONSE" | jq -r '.taskId')
    
    if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
        echo -e "${RED}❌ FAILED: Could not create task${NC}"
        echo "Response: $RESPONSE"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
    
    echo "   Task ID: $TASK_ID"
    
    # Wait for task to complete
    sleep 2
    
    # Check result
    RESULT=$(curl -s "http://localhost:8787/api/tasks/${TASK_ID}")
    STATUS=$(echo "$RESULT" | jq -r '.status')
    
    if [ "$STATUS" == "succeeded" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "   Title: $(echo "$RESULT" | jq -r '.output.title')"
        echo "   Lines: $(echo "$RESULT" | jq -r '.output.lines | length')"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    elif [ "$STATUS" == "failed" ]; then
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Error: $(echo "$RESULT" | jq -r '.error')"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    else
        echo -e "${YELLOW}⏳ Status: $STATUS${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "Test 1: Mock Backend (No External Dependencies)"
echo "-----------------------------------------------"
test_provider "mock" "" "Mock Backend"
echo ""

echo "Test 2: Gemini CLI (if available)"
echo "-----------------------------------------------"
if [ -n "$GEMINI_CMD" ] || command -v gemini &> /dev/null; then
    test_provider "gemini-cli" "gemini-3-flash-preview" "Gemini CLI"
else
    echo -e "${YELLOW}⏭️  SKIPPED: GEMINI_CMD not set or gemini command not found${NC}"
fi
echo ""

echo "Test 3: Gemini Cloud API (if API key available)"
echo "-----------------------------------------------"
if [ -n "$GEMINI_API_KEY" ]; then
    test_provider "gemini" "gemini-3-flash-preview" "Gemini Cloud API"
else
    echo -e "${YELLOW}⏭️  SKIPPED: GEMINI_API_KEY not set${NC}"
fi
echo ""

echo "Test 4: OpenAI Cloud API (if API key available)"
echo "-----------------------------------------------"
if [ -n "$OPENAI_API_KEY" ]; then
    test_provider "openai" "gpt-5-mini" "OpenAI Cloud API"
else
    echo -e "${YELLOW}⏭️  SKIPPED: OPENAI_API_KEY not set${NC}"
fi
echo ""

echo "Test 5: Claude Cloud API (if API key available)"
echo "-----------------------------------------------"
if [ -n "$CLAUDE_API_KEY" ]; then
    test_provider "claude" "claude-sonnet-4-5-20250929" "Claude Cloud API"
else
    echo -e "${YELLOW}⏭️  SKIPPED: CLAUDE_API_KEY not set${NC}"
fi
echo ""

# Summary
echo "=================================================="
echo "📊 Test Summary"
echo "=================================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
