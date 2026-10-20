import { useEffect, useState } from 'react';
import { getAISettings } from '../services/aiSettings';
import { gatewayFetch } from '../services/gateway';
import { Modal } from './Modal';
import '../styles/modals.css';

interface Props {
    onClose: () => void;
}

function logLineClass(line: string): string {
    if (line.includes('✗')) return 'warn';
    if (line.includes('✓')) return 'ok';
    if (line.includes('─')) return 'faint';
    return 'muted';
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

    useEffect(() => {
        // Fetch available providers
        addLog('Fetching available providers...');
        gatewayFetch('/api/llm/providers')
            .then(res => res.json())
            .then(data => {
                setProviders(data.providers);
                addLog(`✓ Loaded ${Object.keys(data.providers).length} providers`);
            })
            .catch(err => {
                addLog(`✗ Gateway unavailable: ${err.message}`);
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
            const response = await gatewayFetch('/api/llm/generate', {
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
        <Modal title="AI debug console" wide onClose={onClose}>
            <div className="stack">
                {/* Current Settings */}
                <div className="section">
                    <div className="hud-label">Current AI settings</div>
                    <div className="code-block mono">
                        <div><strong>Provider:</strong> {settings.provider}</div>
                        <div><strong>Model:</strong> {settings.model}</div>
                    </div>
                </div>

                {/* Available Providers */}
                <div className="section">
                    <div className="hud-label">Available providers</div>
                    {providers ? (
                        <div className="code-block mono">
                            {Object.entries(providers).map(([key, provider]: [string, any]) => (
                                <div key={key}>
                                    <strong className="ai">{key}</strong>
                                    {' '}({provider.type})
                                    <div className="muted">
                                        Models: {provider.models.join(', ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty">Loading…</p>
                    )}
                </div>

                {/* Test Generation */}
                <div className="section">
                    <div className="hud-label">Test AI generation</div>
                    <p className="prose">
                        Test your AI settings with a simple prompt to verify everything is working.
                    </p>

                    <div className="stack">
                        <div className="field">
                            <label htmlFor="ai-debug-prompt">Test prompt</label>
                            <textarea
                                id="ai-debug-prompt"
                                className="input mono"
                                value={testPrompt}
                                onChange={(e) => setTestPrompt(e.target.value)}
                            />
                        </div>

                        <button
                            type="button"
                            className="primary btn-block"
                            onClick={handleTest}
                            disabled={testing || !testPrompt}
                        >
                            {testing ? 'Testing…' : 'Test generation'}
                        </button>
                    </div>
                </div>

                {/* Test Result */}
                {testResult && (
                    <div className="section">
                        <div className="hud-label ok">Success</div>
                        <div className="callout callout-ok mono">
                            {testResult}
                        </div>
                    </div>
                )}

                {/* Test Error */}
                {testError && (
                    <div className="section">
                        <div className="hud-label warn">Error</div>
                        <div className="callout callout-warn mono">
                            {testError}
                        </div>
                    </div>
                )}

                {/* Output Log */}
                {outputLog.length > 0 && (
                    <div className="section">
                        <div className="panel-head">
                            <div className="hud-label">Output log</div>
                            <button type="button" className="btn-ghost" onClick={() => setOutputLog([])}>
                                Clear log
                            </button>
                        </div>
                        <div className="code-block mono">
                            {outputLog.map((line, idx) => (
                                <div key={idx} className={logLineClass(line)}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Instructions */}
                <div className="callout callout-ai">
                    <strong>Troubleshooting tips</strong>
                    <ul className="small">
                        <li>Check that your selected provider is installed and accessible</li>
                        <li>For CLI providers, ensure the CLI tool is in your PATH</li>
                        <li>For Cloud API providers, verify API keys are configured in the gateway</li>
                        <li>Check the browser console (F12) for additional error details</li>
                        <li>Check the gateway terminal for server-side errors</li>
                    </ul>
                </div>
            </div>
        </Modal>
    );
}
