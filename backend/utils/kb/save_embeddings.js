// save_embeddings.js
const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');

const CHUNKS_PATH = path.join(__dirname, 'chunks.json'); // array of strings
const VECTOR_DB_PATH = path.join(__dirname, 'vector-db');
const OUTPUT_EMBEDDINGS = path.join(VECTOR_DB_PATH, 'knowledge.index');
const OUTPUT_METADATA = path.join(VECTOR_DB_PATH, 'chunks-metadata.json');

async function generateEmbeddings() {
  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error('Missing chunks.json file');
    process.exit(1);
  }

  const texts = JSON.parse(fs.readFileSync(CHUNKS_PATH, 'utf-8'));

  console.log(`Loaded ${texts.length} chunks`);

  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const embeddings = [];
  const metadata = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const result = await embedder(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(result.data));
    metadata.push({
      chunkId: i,
      section: `Chunk ${i + 1}`,
    });
  }

  fs.mkdirSync(VECTOR_DB_PATH, { recursive: true });

  fs.writeFileSync(OUTPUT_EMBEDDINGS, JSON.stringify(embeddings));
  fs.writeFileSync(OUTPUT_METADATA, JSON.stringify({ metadata, texts }));

  console.log(`✅ Embeddings saved to ${OUTPUT_EMBEDDINGS}`);
}

generateEmbeddings().catch(console.error);
