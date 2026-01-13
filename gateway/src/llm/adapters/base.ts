/**
 * Base CLI Adapter Interface
 * 
 * Defines the contract for CLI tool adapters.
 * Each adapter knows how to build the command-line invocation
 * for its specific CLI tool (gemini, claude, codex, etc.)
 */

export interface CLIInvocation {
    /** Command to execute (e.g., 'gemini', 'claude') */
    command: string;

    /** Command-line arguments */
    args: string[];

    /** Environment variables to pass to the process */
    env?: Record<string, string>;

    /** Expected response format from the CLI tool */
    responseFormat: 'json-stream' | 'text';
}

export interface CLIAdapterParams {
    /** The prompt to send to the LLM */
    prompt: string;

    /** Optional model to use */
    model?: string;

    /** Optional working directory */
    cwd?: string;
}

/**
 * Base interface for CLI adapters
 */
export interface CLIAdapter {
    /**
     * Build the command-line invocation for this CLI tool
     */
    buildCommand(params: CLIAdapterParams): CLIInvocation;
}
