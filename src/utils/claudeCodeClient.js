const config = require('../config');

// Dynamic import for ES module
let claudeCodeModule = null;
async function loadClaudeCode() {
    if (!claudeCodeModule) {
        claudeCodeModule = await import('@anthropic-ai/claude-code/sdk.mjs');
    }
    return claudeCodeModule;
}

/**
 * Claude Code SDK Client
 * Native integration with Claude Code SDK for optimal performance
 * Uses streaming for real-time analysis and unlimited token usage
 */
class ClaudeCodeClient {
    constructor() {
        this.maxConcurrentRequests = 20; // Claude Code can handle high concurrency
        this.activeRequests = 0;
        this.requestQueue = [];
        
        console.log('✅ Claude Code SDK Client initialized successfully');
    }

    async call(prompt) {
        const messages = [];
        const abortController = new AbortController();
        
        try {
            // Load Claude Code SDK dynamically
            const { query } = await loadClaudeCode();
            
            // Use Claude Code SDK query method
            for await (const message of query({
                prompt: `${prompt.system}\n\n${prompt.user}`,
                abortController,
                options: {
                    maxTurns: 1, // Single response for analysis
                    stream: false // Non-streaming for compatibility
                }
            })) {
                messages.push(message);
            }
            
            // Extract the response content
            const lastMessage = messages[messages.length - 1];
            return {
                body: lastMessage.content || lastMessage.text || '',
                usage: { 
                    total_tokens: 0 // Claude Code doesn't provide token counts
                }
            };
        } catch (error) {
            console.error('Claude Code SDK call failed:', error.message);
            throw new Error(`Claude Code SDK call failed: ${error.message}`);
        }
    }

    async query(promptString) {
        const prompt = {
            system: 'You are an expert software engineer specializing in code analysis. Provide detailed, accurate analysis in valid JSON format when requested.',
            user: promptString
        };
        const response = await this.call(prompt);
        return response.body;
    }

    async createChatCompletion(options) {
        // Convert to Claude Code format
        let systemMessage = '';
        let userMessage = '';
        
        for (const message of options.messages) {
            if (message.role === 'system') {
                systemMessage = message.content;
            } else if (message.role === 'user') {
                userMessage = message.content;
            }
        }

        const messages = [];
        const abortController = new AbortController();
        
        try {
            // Load Claude Code SDK dynamically  
            const { query } = await loadClaudeCode();
            
            for await (const message of query({
                prompt: `${systemMessage}\n\n${userMessage}`,
                abortController,
                options: {
                    maxTurns: 1,
                    stream: false
                }
            })) {
                messages.push(message);
            }
            
            const lastMessage = messages[messages.length - 1];
            
            // Return OpenAI-compatible format
            return {
                choices: [{
                    message: {
                        content: lastMessage.content || lastMessage.text || '',
                        role: 'assistant'
                    }
                }],
                usage: {
                    total_tokens: 0 // Claude Code doesn't provide token counts
                }
            };
        } catch (error) {
            console.error('[ClaudeCodeClient] createChatCompletion failed:', error.message);
            throw error;
        }
    }

    async testConnection() {
        try {
            const testPrompt = {
                system: 'You are a helpful assistant.',
                user: 'Hello, please respond with exactly "Connection successful"'
            };
            
            const response = await this.call(testPrompt);
            return response.body.includes('Connection successful');
        } catch (error) {
            console.error('Claude Code SDK connection test failed:', error.message);
            return false;
        }
    }

    // Schedule request method for compatibility with existing queue system
    _scheduleRequest(operation) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ operation, resolve, reject });
            this._processQueue();
        });
    }

    _processQueue() {
        if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
            return;
        }

        this.activeRequests++;
        const { operation, resolve, reject } = this.requestQueue.shift();
        
        operation()
            .then(resolve)
            .catch(reject)
            .finally(() => {
                this.activeRequests--;
                this._processQueue();
            });
    }
}

let clientInstance;

function getClaudeCodeClient() {
    if (!clientInstance) {
        clientInstance = new ClaudeCodeClient();
    }
    return clientInstance;
}

module.exports = {
    getClaudeCodeClient,
    ClaudeCodeClient,
};