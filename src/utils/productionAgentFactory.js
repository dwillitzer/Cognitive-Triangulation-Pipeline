const path = require('path');
const EntityScout = require('../agents/EntityScout');
const GraphBuilder = require('../agents/GraphBuilder');
const RelationshipResolver = require('../agents/RelationshipResolver');
const SelfCleaningAgent = require('../agents/SelfCleaningAgent');
const TransactionalOutboxPublisher = require('../services/TransactionalOutboxPublisher');
const { getLLMClient } = require('./llmClientFactory');
const { getDb } = require('./sqliteDb');

/**
 * Production Agent Factory
 * Creates and configures agents for production pipeline execution
 * Integrates with Claude Code SDK for optimal performance
 */
class ProductionAgentFactory {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './database.db';
        this.targetDirectory = options.targetDirectory;
        this.llmClient = null;
        this.db = null;
    }

    async initialize() {
        console.log('🏭 Initializing Production Agent Factory...');
        
        // Initialize LLM client (Claude Code SDK preferred)
        this.llmClient = getLLMClient();
        console.log(`✅ LLM Client: ${this.llmClient.constructor.name}`);
        
        // Initialize database
        this.db = getDb(this.dbPath);
        console.log(`✅ Database: ${this.dbPath}`);
        
        return this;
    }

    createEntityScout() {
        if (!this.targetDirectory) {
            throw new Error('Target directory required for EntityScout');
        }
        
        console.log('🕵️ Creating EntityScout agent...');
        return new EntityScout(this.targetDirectory, this.db);
    }

    createRelationshipResolver() {
        console.log('🧠 Creating RelationshipResolver agent...');
        return new RelationshipResolver(this.db, this.llmClient);
    }

    createGraphBuilder() {
        console.log('🏗️ Creating GraphBuilder agent...');
        return new GraphBuilder(this.db);
    }

    createSelfCleaningAgent() {
        console.log('🧹 Creating SelfCleaningAgent...');
        return new SelfCleaningAgent(this.targetDirectory, this.db);
    }

    createTransactionalOutboxPublisher() {
        console.log('📮 Creating TransactionalOutboxPublisher...');
        return new TransactionalOutboxPublisher(this.db);
    }

    async createAllAgents() {
        await this.initialize();
        
        return {
            entityScout: this.createEntityScout(),
            relationshipResolver: this.createRelationshipResolver(),
            graphBuilder: this.createGraphBuilder(),
            selfCleaningAgent: this.createSelfCleaningAgent(),
            outboxPublisher: this.createTransactionalOutboxPublisher()
        };
    }

    async testLLMConnection() {
        try {
            if (!this.llmClient) {
                this.llmClient = getLLMClient();
            }
            
            console.log('🧪 Testing LLM connection...');
            
            // For Claude Code SDK, test with a simple query
            if (this.llmClient.constructor.name === 'ClaudeCodeClient') {
                console.log('🚀 Testing Claude Code SDK...');
                const response = await this.llmClient.query('Respond with exactly: "Test successful"');
                const success = response.includes('Test successful');
                console.log(`Claude Code SDK test: ${success ? '✅ PASSED' : '❌ FAILED'}`);
                return success;
            } else {
                // Use existing test method for other clients
                const success = await this.llmClient.testConnection();
                console.log(`LLM connection test: ${success ? '✅ PASSED' : '❌ FAILED'}`);
                return success;
            }
        } catch (error) {
            console.error('❌ LLM connection test failed:', error.message);
            
            // If Claude Code SDK fails, suggest browser authentication
            if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
                console.log('🌐 Claude Code may require browser authentication');
                console.log('📖 Visit: https://claude.ai/login to authenticate');
                console.log('🔄 Then restart the pipeline');
            }
            
            return false;
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up Production Agent Factory...');
        
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = ProductionAgentFactory;