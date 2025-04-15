const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');
const faiss = require('faiss-node');

// Configuration
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384; // Dimension for the MiniLM model
const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'kb_copy.txt');
const VECTOR_DB_PATH = path.join(__dirname, 'vector-db');
const METADATA_PATH = path.join(__dirname, 'chunks-metadata2.json');

/**
 * Split text into overlapping chunks
 * @param {string} text - The text to split
 * @param {number} size - Size of each chunk
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<string>} - Array of text chunks
 */
function splitIntoChunks(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = [];
  let currentLength = 0;

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Add line to current chunk
    currentChunk.push(line);
    currentLength += line.length;

    // Check if we've reached the chunk size
    if (currentLength >= size) {
      chunks.push(currentChunk.join('\n'));
      
      // Keep the overlapping portion for the next chunk
      const overlapLines = [];
      let overlapLength = 0;
      
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        overlapLines.unshift(currentChunk[i]);
        overlapLength += currentChunk[i].length;
        
        if (overlapLength >= overlap) break;
      }
      
      currentChunk = overlapLines;
      currentLength = overlapLength;
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

/**
 * Process the knowledge base into semantic chunks
 * One chunk per bullet group (type: 'general')
 * One chunk per Q/A pair (type: 'qa')
 * @param {string} text
 * @returns {Array<{ text: string, metadata: object }>}
 */
function processTextByHeadings(text) {
  const lines = text.split('\n');
  const chunks = [];

  let currentSection = null;
  let currentSubsection = null;
  let buffer = [];
  let bufferType = null;

  const flushBuffer = () => {
    if (!buffer.length) return;

    const chunkText = buffer.join('\n').trim();
    if (!chunkText) return;

    chunks.push({
      text: chunkText,
      metadata: {
        section: currentSection,
        subsection: currentSubsection,
        type: bufferType
      }
    });

    buffer = [];
    bufferType = null;
  };

  const isQuestion = (line) => line.trim().startsWith('Q.');
  const isAnswer = (line) => line.trim().startsWith('A.');
  const isBullet = (line) => /^[-*0-9.]/.test(line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect section
    if (line.startsWith('## ')) {
      flushBuffer();
      currentSection = line.replace(/^## /, '').trim();
      currentSubsection = null;
      continue;
    }

    // Detect subsection
    if (line.startsWith('### ')) {
      flushBuffer();
      currentSubsection = line.replace(/^### /, '').trim();
      continue;
    }

    if (!currentSection || !currentSubsection) continue;

    // Handle Q/A
    if (isQuestion(line)) {
      flushBuffer();
      bufferType = 'qa';
      buffer.push(line);

      // Capture A and any indented content
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();

        if (nextLine.startsWith('## ') || nextLine.startsWith('### ') || isQuestion(nextLine)) {
          i = j - 1;
          break;
        }

        buffer.push(nextLine);
        i = j;
      }

      flushBuffer();
      continue;
    }

    // Handle general bullet advice
    if (isBullet(line) || (!isQuestion(line) && !isAnswer(line) && line !== '')) {
      if (bufferType !== 'general') {
        flushBuffer();
        bufferType = 'general';
      }
      buffer.push(line);
    }
  }

  flushBuffer();
  return chunks;
}


/**
 * Generate embeddings for text chunks
 * @param {Array<Object>} chunks - Array of text chunks with metadata
 * @returns {Promise<Object>} - Object with embeddings and metadata
 */
async function generateEmbeddings(chunks) {
  console.log(`Generating embeddings for ${chunks.length} chunks...`);
  
  // Initialize the embedding model
  const embedder = await pipeline('feature-extraction', MODEL_NAME);
  
  // Generate embeddings for each chunk
  const embeddings = [];
  const metadata = [];
  const texts = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i+1}/${chunks.length}`);
    
    try {
      // Generate embedding
      const output = await embedder(chunk.text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);
      
      // Validate embedding dimension
      if (embedding.length !== EMBEDDING_DIM) {
        console.warn(`Warning: Embedding dimension mismatch. Expected ${EMBEDDING_DIM}, got ${embedding.length}. Skipping chunk.`);
        continue;
      }
      
      // Store results
      embeddings.push(embedding);
      metadata.push(chunk.metadata);
      texts.push(chunk.text);
      
      // Log progress for every 10 chunks
      if ((i + 1) % 10 === 0) {
        console.log(`Processed ${i+1}/${chunks.length} chunks`);
      }
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
    }
  }

  // Make sure we have at least one valid embedding
  if (embeddings.length === 0) {
    throw new Error("No valid embeddings were generated. Check your text chunks and model configuration.");
  }
  
  return { embeddings, metadata, texts };
}

/**
 * Create and save FAISS index
 * @param {Array<Array<number>>} embeddings - Array of embedding vectors
 * @returns {Object} - FAISS index
 */
function createFaissIndex(embeddings) {
  console.log("Creating FAISS index...");
  
  // Validate embeddings
  if (!embeddings || embeddings.length === 0) {
    throw new Error("No embeddings provided to create FAISS index");
  }
  
  // Ensure all embeddings have the same dimension
  const dimension = embeddings[0].length;
  for (let i = 0; i < embeddings.length; i++) {
    if (embeddings[i].length !== dimension) {
      throw new Error(`Embedding at index ${i} has inconsistent dimension: expected ${dimension}, got ${embeddings[i].length}`);
    }
  }
  
  console.log("Embedding Structure:", embeddings.length , "x", embeddings[0].length); // Debugging
  
   
  // Create directory if it doesn't exist
  if (!fs.existsSync(VECTOR_DB_PATH)) {
    fs.mkdirSync(VECTOR_DB_PATH, { recursive: true });
  }
  
  // Create and save index
  const index = new faiss.IndexFlatL2(dimension);
  embeddings.forEach((vec) => {
    index.add(vec);  // Add each vector individually
  });
  
  
  console.log(`Created index with ${index.ntotal} vectors of dimension ${dimension}`);
  
  // Save the index to disk
  const indexPath = path.join(VECTOR_DB_PATH, 'knowledge2.index');
  index.write(indexPath);
  console.log(`Saved index to ${indexPath}`);
  
  return index;
}

/**
 * Main function to process knowledge base
 */
async function processKnowledgeBase() {
  try {
    // Read the knowledge base
    console.log(`Reading knowledge base from ${KNOWLEDGE_BASE_PATH}`);
    const text = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf-8');
    
    // Process by headings for more semantic chunks
    const chunks = processTextByHeadings(text);
    console.log(`Created ${chunks.length} semantic chunks`);
    
    // Generate embeddings
    const { embeddings, metadata, texts } = await generateEmbeddings(chunks);
    console.log(`Successfully generated ${embeddings.length} embeddings`);
    
    // Create and save FAISS index
    const index = createFaissIndex(embeddings);
    
    // Save metadata and texts for retrieval
    fs.writeFileSync(
      METADATA_PATH,
      JSON.stringify({ metadata, texts }, null, 2)
    );
    
    console.log(`Saved metadata and texts to ${METADATA_PATH}`);
    console.log("Processing complete!");
    
    return { index, metadata, texts };
  } catch (error) {
    console.error("Error processing knowledge base:", error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  processKnowledgeBase().catch(console.error);
}

module.exports = {
  processKnowledgeBase,
  splitIntoChunks,
  processTextByHeadings,
  generateEmbeddings,
  createFaissIndex
};