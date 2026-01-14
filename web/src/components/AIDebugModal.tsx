import React, { useState } from 'react';
import { getAISettings } from '../services/aiSettings';

interface Props {
    onClose: () => void;
}

export function AIDebugModal({ onClose }: Props) {
    const [testPrompt, setTestPrompt] = useState('Write a short fantasy quest title.');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testError, setTestError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [providers, setProviders] = useState<any>(null);
    const [outputLog, setOutputLog] = useState<string[]>([]);

    const addLog = (message: string) => {
        setOutputLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    };

    React.useEffect(() => {
        // Fetch available providers
        addLog('Fetching available providers...');
        fetch('http://localhost:8787/api/llm/providers')
            .then(res => res.json())
            .then(data => {
                setProviders(data.providers);
                addLog(`✓ Loaded ${Object.keys(data.providers).length} providers`);
            })
            .catch(err => {
                console.error('Failed to fetch providers:', err);
                addLog(`✗ Failed to fetch providers: ${err.message}`);
            });
    }, []);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        setTestError(null);

        const settings = getAISettings();
        addLog('─────────────────────────────');
        addLog(`Starting AI test generation`);
        addLog(`Provider: ${settings.provider}`);
        addLog(`Model: ${settings.model}`);
        addLog(`Prompt length: ${testPrompt.length} characters`);

        const startTime = Date.now();

        try {
            addLog('Sending request to gateway...');
            const response = await fetch('http://localhost:8787/api/llm/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: settings.provider,
                    model: settings.model,
                    prompt: testPrompt,
                    maxTokens: 100,
                    temperature: 0.7
                })
            });

            const elapsed = Date.now() - startTime;
            addLog(`Response received (${elapsed}ms)`);

            if (!response.ok) {
                const error = await response.json();
                const errorMsg = error.error || `HTTP ${response.status}: ${response.statusText}`;
                addLog(`✗ Request failed: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            const data = await response.json();
            addLog(`✓ Generation successful`);
            addLog(`Response length: ${data.text?.length || 0} characters`);
            setTestResult(data.text);
        } catch (error: any) {
            console.error('AI Test Error:', error);
            addLog(`✗ Error: ${error.message}`);
            setTestError(error.message || String(error));
        } finally {
            setTesting(false);
            const totalTime = Date.now() - startTime;
            addLog(`Total time: ${totalTime}ms`);
        }
    };

    const settings = getAISettings();

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div className="card" style={{
                maxWidth: '700px',
                width: '90%',
                maxHeight: '90vh',
                overflowY: 'auto',
                border: '1px solid #666'
            }} onClick={e => e.stopPropagation()}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                    borderBottom: '1px solid #333',
                    paddingBottom: '0.5rem'
                }}>
                    <h2 style={{ margin: 0 }}>🔧 AI Debug Console</h2>
                    <button onClick={onClose} style={{
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        fontSize: '1.5rem',
                        cursor: 'pointer'
                    }}>&times;</button>
                </div>

                {/* Current Settings */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3>Current AI Settings</h3>
                    <div style={{
                        padding: '1rem',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem'
                    }}>
                        <div><strong>Provider:</strong> {settings.provider}</div>
                        <div><strong>Model:</strong> {settings.model}</div>
                    </div>
                </div>

                {/* Available Providers */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3>Available Providers</h3>
                    {providers ? (
                        <div style={{
                            padding: '1rem',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {Object.entries(providers).map(([key, provider]: [string, any]) => (
                                <div key={key} style={{ marginBottom: '0.5rem' }}>
                                    <strong style={{ color: '#9333ea' }}>{key}</strong>
                                    {' '}({provider.type})
                                    <div style={{ paddingLeft: '1rem', color: '#888' }}>
                                        Models: {provider.models.join(', ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: '#888' }}>Loading...</div>
                    )}
                </div>

                {/* Test Generation */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3>Test AI Generation</h3>
                    <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                        Test your AI settings with a simple prompt to verify everything is working.
                    </p>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.85rem',
                            color: '#888',
                            marginBottom: '0.5rem'
                        }}>
                            Test Prompt:
                        </label>
                        <textarea
                            value={testPrompt}
                            onChange={(e) => setTestPrompt(e.target.value)}
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: '0.75rem',
                                background: '#111',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '0.9rem',
                                fontFamily: 'monospace'
                            }}
                        />
                    </div>

                    <button
                        onClick={handleTest}
                        disabled={testing || !testPrompt}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            background: testing ? '#555' : 'var(--color-primary)',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: testing ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            opacity: testing ? 0.6 : 1
                        }}
                    >
                        {testing ? '⏳ Testing...' : '🧪 Test Generation'}
                    </button>
                </div>

                {/* Test Result */}
                {testResult && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ color: '#4ade80' }}>✓ Success</h4>
                        <div style={{
                            padding: '1rem',
                            background: 'rgba(74, 222, 128, 0.1)',
                            border: '1px solid #4ade80',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap'
                        }}>
                            {testResult}
                        </div>
                    </div>
                )}

                {/* Test Error */}
                {testError && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ color: '#ef4444' }}>✗ Error</h4>
                        <div style={{
                            padding: '1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '300px',
                            overflowY: 'auto'
                        }}>
                            {testError}
                        </div>
                    </div>
                )}

                {/* Output Log */}
                {outputLog.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0 }}>Output Log</h3>
                            <button
                                onClick={() => setOutputLog([])}
                                style={{
                                    padding: '0.25rem 0.5rem',
                                    background: 'transparent',
                                    border: '1px solid #666',
                                    borderRadius: '4px',
                                    color: '#888',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Clear Log
                            </button>
                        </div>
                        <div style={{
                            padding: '1rem',
                            background: '#000',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            color: '#0f0'
                        }}>
                            {outputLog.map((line, idx) => (
                                <div key={idx} style={{
                                    color: line.includes('✗') ? '#ef4444' :
                                        line.includes('✓') ? '#4ade80' :
                                            line.includes('─') ? '#666' :
                                                '#aaa'
                                }}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Instructions */}
                <div style={{
                    padding: '1rem',
                    background: 'rgba(147, 51, 234, 0.1)',
                    border: '1px solid #9333ea',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: '#ccc'
                }}>
                    <strong style={{ color: '#9333ea' }}>💡 Troubleshooting Tips:</strong>
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                        <li>Check that your selected provider is installed and accessible</li>
                        <li>For CLI providers, ensure the CLI tool is in your PATH</li>
                        <li>For Cloud API providers, verify API keys are configured in the gateway</li>
                        <li>Check the browser console (F12) for additional error details</li>
                        <li>Check the gateway terminal for server-side errors</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
