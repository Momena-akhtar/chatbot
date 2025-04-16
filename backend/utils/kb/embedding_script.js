const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
const faiss = require('faiss-node');
const { IndexFlatL2 } = require('faiss-node');
const { processKnowledgeBase } = require('./embedding_generator');

// Paths
const VECTOR_DB_PATH = path.join(__dirname, 'vector-db');
const METADATA_PATH = path.join(__dirname, 'chunks-metadata.json');
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Test vector search with a query
 */
async function generateEmbeddings(query, k=2) {
  console.log(`Processing query: "${query}"`);
  
  // Load metadata and texts
  const { metadata, texts } = JSON.parse(
    fs.readFileSync(METADATA_PATH, 'utf-8')
  );
 
  // Load the FAISS index
  const indexPath = path.join(VECTOR_DB_PATH, 'new.index');
  const index = IndexFlatL2.read(indexPath);

  console.log(`Loaded index with ${index.ntotal()} vectors`);
  
  // Generate embedding for the query
  const embedder = await pipeline('feature-extraction', MODEL_NAME);
  const output = await embedder(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data);
  
  // Search the index
  const { distances, labels } = index.search(queryEmbedding, k);
  
  // Prepare results
  const results = [];
  for (let i = 0; i < labels.length; i++) {
    const idx = labels[i];
    const distance = distances[i];
    const meta = metadata[idx];
    const text = texts[idx];
    
    results.push({
      distance: distance.toFixed(4),
      section: meta.section || 'N/A',
      subsection: meta.subsection || null,
      topic: meta.topic || null,
      context: text.substring(0, 300) + (text.length > 300 ? "..." : "")
    });
  }
  
  return results;
}

/**
 * Initialize vector database if needed
 */
async function initializeVectorDatabase() {
  const indexPath = path.join(VECTOR_DB_PATH, 'new.index');
  if (!fs.existsSync(indexPath)) {
    console.log("Vector database not found. Creating embeddings...");
    await processKnowledgeBase();
  }
}


module.exports = {
  generateEmbeddings,
  initializeVectorDatabase
};

