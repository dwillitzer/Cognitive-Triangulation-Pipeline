// Use dynamic import for ES module with specific path
async function loadClaudeCode() {
    const { query } = await import('@anthropic-ai/claude-code/sdk.mjs');
    return { query };
}

async function testClaudeCode() {
    console.log('🧪 Testing Claude Code SDK...');
    
    try {
        // Load ES module
        const { query } = await loadClaudeCode();
        console.log('📦 Claude Code SDK loaded successfully');
        
        const messages = [];
        const abortController = new AbortController();
        
        console.log('📡 Sending test query...');
        
        for await (const message of query({
            prompt: 'Hello! Please respond with exactly: "Claude Code SDK working"',
            abortController,
            options: {
                maxTurns: 1,
                stream: false
            }
        })) {
            messages.push(message);
            console.log('📥 Received message:', message);
        }
        
        console.log('✅ All messages received:', messages.length);
        const lastMessage = messages[messages.length - 1];
        const response = lastMessage.content || lastMessage.text || '';
        
        console.log('📝 Response:', response);
        
        if (response.includes('Claude Code SDK working')) {
            console.log('🎉 SUCCESS: Claude Code SDK is working!');
            return true;
        } else {
            console.log('⚠️  SDK responded but unexpected content');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Claude Code SDK Error:', error.message);
        
        if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
            console.log('');
            console.log('🔐 Authentication Required:');
            console.log('📖 Please visit: https://claude.ai/login');
            console.log('🔑 Log in to Claude and then restart this test');
        } else if (error.message.includes('network') || error.message.includes('connection')) {
            console.log('');
            console.log('🌐 Network Issue:');
            console.log('📡 Check internet connection and try again');
        }
        
        return false;
    }
}

// Run the test
testClaudeCode().then(success => {
    if (success) {
        console.log('');
        console.log('🚀 Ready to start codebase analysis with Claude Code SDK!');
        process.exit(0);
    } else {
        console.log('');
        console.log('❌ Claude Code SDK not ready. Please resolve authentication and try again.');
        process.exit(1);
    }
}).catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
});