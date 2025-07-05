const config = require('../config');
const { getClaudeCodeClient } = require('./claudeCodeClient');
const { getClaudeClient } = require('./claudeClient');
const { getDeepseekClient } = require('./deepseekClient');

/**
 * LLM Client Factory
 * Creates the appropriate LLM client based on configuration
 * Supports Claude (preferred) and DeepSeek (fallback)
 */

let clientInstance;

function getLLMClient() {
    if (!clientInstance) {
        const provider = config.LLM_PROVIDER || 'claude';
        
        console.log(`🤖 Initializing LLM Client: ${provider}`);
        
        switch (provider.toLowerCase()) {
            case 'claude':
            case 'claude-code':
                // Try Claude Code SDK first (native integration)
                try {
                    clientInstance = getClaudeCodeClient();
                    console.log('🚀 Using Claude Code SDK (native integration)');
                } catch (error) {
                    console.warn('⚠️  Claude Code SDK not available, falling back to HTTP client');
                    if (!config.CLAUDE_API_KEY) {
                        console.warn('⚠️  Claude API key not found, falling back to DeepSeek');
                        clientInstance = getDeepseekClient();
                    } else {
                        clientInstance = getClaudeClient();
                    }
                }
                break;
                
            case 'deepseek':
                clientInstance = getDeepseekClient();
                break;
                
            default:
                console.warn(`Unknown LLM provider: ${provider}, defaulting to Claude`);
                clientInstance = getClaudeClient();
        }
        
        console.log(`✅ LLM Client initialized: ${clientInstance.constructor.name}`);
    }
    
    return clientInstance;
}

/**
 * Backward compatibility - export the factory as getDeepseekClient
 * This allows existing code to work without changes
 */
function getDeepseekClientCompatibility() {
    return getLLMClient();
}

module.exports = {
    getLLMClient,
    getDeepseekClient: getDeepseekClientCompatibility, // Backward compatibility
};