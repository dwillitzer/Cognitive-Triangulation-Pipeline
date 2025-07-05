const https = require('https');
require('dotenv').config();
const config = require('../config');

/**
 * Pure Claude LLM Client
 * Native implementation using HTTPS requests to Anthropic Claude API
 * Optimized for Sonnet 4 with unlimited token usage for code analysis
 */
class ClaudeClient {
    constructor() {
        this.baseURL = 'https://api.anthropic.com';
        this.timeout = 1800000; // 30 minutes timeout for very complex analysis
        this.agent = new https.Agent({ keepAlive: false, maxSockets: 100 });
        this.maxConcurrentRequests = 20; // Max plan allows very high concurrency
        this.activeRequests = 0;
        this.requestQueue = [];
        
        this._apiKey = null;
    }

    get apiKey() {
        if (!this._apiKey) {
            this._apiKey = config.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
            if (!this._apiKey) {
                throw new Error('CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable is required');
            }
            console.log('✅ Claude Client initialized successfully');
        }
        return this._apiKey;
    }

    async call(prompt) {
        const model = config.CLAUDE_MODEL || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
        
        const requestBody = JSON.stringify({
            model: model,
            max_tokens: 8192, // Claude's maximum - with Max plan, unlimited tokens
            messages: [
                { 
                    role: 'user', 
                    content: `${prompt.system}\n\n${prompt.user}` 
                }
            ],
            temperature: 0.0,
            system: 'You are an expert software engineer specializing in code analysis. Always respond with valid JSON when requested.'
        });

        try {
            const response = await this._scheduleRequest('/v1/messages', 'POST', requestBody);
            return {
                body: response.content[0].text,
                usage: response.usage
            };
        } catch (error) {
            console.error('Claude API call failed after retries:', error.message);
            throw new Error(`Claude API call failed: ${error.message}`);
        }
    }

    async query(promptString) {
        const prompt = {
            system: 'You are an expert software engineer specializing in code analysis. Provide detailed, accurate analysis.',
            user: promptString
        };
        const response = await this.call(prompt);
        return response.body;
    }

    async createChatCompletion(options) {
        const model = options.model || config.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
        
        // Convert OpenAI-style messages to Claude format
        let systemMessage = '';
        const userMessages = [];
        
        for (const message of options.messages) {
            if (message.role === 'system') {
                systemMessage = message.content;
            } else {
                userMessages.push(message);
            }
        }

        const requestBody = JSON.stringify({
            model: model,
            max_tokens: options.max_tokens || 8192,
            messages: userMessages,
            temperature: options.temperature || 0.0,
            system: systemMessage || 'You are an expert software engineer specializing in code analysis.'
        });

        try {
            const response = await this._scheduleRequest('/v1/messages', 'POST', requestBody);
            // Convert Claude response to OpenAI-style format for compatibility
            return {
                choices: [{
                    message: {
                        content: response.content[0].text,
                        role: 'assistant'
                    }
                }],
                usage: response.usage
            };
        } catch (error) {
            console.error('[ClaudeClient] createChatCompletion failed after all retries:', error.message);
            throw error;
        }
    }

    _scheduleRequest(endpoint, method, body) {
        return new Promise((resolve, reject) => {
            console.log(`[ClaudeClient] Scheduling request. Active: ${this.activeRequests}, Queued: ${this.requestQueue.length}`);
            this.requestQueue.push({ endpoint, method, body, resolve, reject });
            this._processQueue();
        });
    }

    _processQueue() {
        if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
            return;
        }

        this.activeRequests++;
        const { endpoint, method, body, resolve, reject } = this.requestQueue.shift();
        
        console.log(`[ClaudeClient] Starting request. Active: ${this.activeRequests}`);

        this._makeRequestWithRetry(endpoint, method, body)
            .then(resolve)
            .catch(reject)
            .finally(() => {
                this.activeRequests--;
                console.log(`[ClaudeClient] Finished request. Active: ${this.activeRequests}`);
                this._processQueue();
            });
    }

    _isRetryableError(error) {
        return error.status >= 500 || 
               error.status === 429 || // Rate limit - Claude has generous limits but still worth retrying
               ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);
    }

    async _makeRequestWithRetry(endpoint, method, body, retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await this._makeRequest(endpoint, method, body);
                return response;
            } catch (error) {
                console.error(`[ClaudeClient] Request attempt ${i + 1} FAILED. Error: ${error.message}`, { code: error.code, status: error.status });
                if (this._isRetryableError(error) && i < retries - 1) {
                    const backoffDelay = delay * Math.pow(2, i);
                    console.warn(`[ClaudeClient] Retrying in ${backoffDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                } else {
                    console.error(`[ClaudeClient] FINAL request failure after ${i + 1} attempts.`, { endpoint, error: error.message });
                    throw error;
                }
            }
        }
    }

    _makeRequest(endpoint, method, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseURL + endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(body)
                },
                agent: this.agent,
                timeout: this.timeout
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsedData);
                        } else {
                            const error = new Error(parsedData.error?.message || `HTTP ${res.statusCode}`);
                            error.status = res.statusCode;
                            reject(error);
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${parseError.message}. Raw response: ${data}`));
                    }
                });
            });

            req.on('error', (error) => reject(error));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(body);
            req.end();
        });
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
            console.error('Claude connection test failed:', error.message);
            return false;
        }
    }
}

let clientInstance;

function getClaudeClient() {
    if (!clientInstance) {
        clientInstance = new ClaudeClient();
    }
    return clientInstance;
}

module.exports = {
    getClaudeClient,
    ClaudeClient,
};