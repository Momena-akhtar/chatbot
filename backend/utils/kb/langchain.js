// index.js
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "langchain/vectorstores/faiss";
import { ConversationSummaryBufferMemory } from "langchain/memory";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";

import dotenv from "dotenv";
dotenv.config()
import express from "express";
import cors from "cors";
import session from "express-session";

import { RedisStore } from "connect-redis";
import Redis from "ioredis";
import path from "path";
import fs from "fs";

const __dirname = path.resolve()

const redisClient = new Redis({
  host: "127.0.0.1",
  port: 6379, 
});

const app = express();

// Configure middleware
app.use(express.json());
app.use(cors());
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
      secure: false,
    },
  })
);

// Initialize vector store - Path to your FAISS index directory
const VECTOR_DB_PATH = path.join(__dirname, "utils/kb/vector-db");
const METADATA_PATH = path.join(__dirname, "utils/kb/chunks-metadata.json");

// Initialize session middleware for chat
app.use((req, res, next) => {
  if (!req.session.chat) {
    req.session.chat = {
      history: [],
      lastActive: Date.now(),
    };
  }
  next();
});

// Middleware to handle chat expiration
app.use((req, res, next) => {
  if (
    req.session.chat &&
    Date.now() - req.session.chat.lastActive > 1000 * 60 * 30
  ) {
    // 30 minutes
    req.session.destroy();
    return res.status(440).json({ error: "Session expired" });
  }
  next();
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Initialize LangChain components
let vectorStore;
let conversationChain;

// LangChain QA prompt template
const QA_PROMPT = new PromptTemplate({
  template: `
    You are an AI assistant with access to context retrieved from a knowledge base. Follow these rules:

    1. Use the provided context to answer the user's question as precisely as possible.
    2. If you must infer anything not in the context, preface your answer with: "Based on inference:".
    3. Never fabricate information. If context is insufficient, provide a general but truthful answer.
    4. Structure your responses with bullet points or short, clear paragraphs.
    5. Remain concise, helpful, and professional.

    --- Knowledge Base Context ---
    {context}

    --- Chat History ---
    {chat_history}

    --- Question ---
    {question}
  `,
  inputVariables: ["context", "chat_history", "question"],
});
  

// Initialize the vector store and conversation chain
async function initLangChain() {
  try {
    // Load metadata and texts
    const { metadata, texts } = JSON.parse(
      fs.readFileSync(METADATA_PATH, "utf-8")
    );

    // Create document objects from texts and metadata
    const documents = texts.map((text, i) => ({
      pageContent: text,
      metadata: metadata[i] || {},
    }));

    // Initialize embeddings
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const indexPath = path.join(VECTOR_DB_PATH, "new.index");

      if (fs.existsSync(indexPath)) {
        vectorStore = await FaissStore.load(VECTOR_DB_PATH, embeddings);
        console.log("FAISS index loaded from disk.");
      } else {
        // Create vector store from documents
        vectorStore = await FaissStore.fromDocuments(documents, embeddings);
        await vectorStore.save(VECTOR_DB_PATH);
        console.log("FAISS index created and saved to disk.");
      }

    // Initialize LLM
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      streaming: true,
      temperature: 0.7,
    });

    // Initialize memory
    const memory = new ConversationSummaryBufferMemory({
      llm: new OpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-3.5-turbo",
        temperature: 0,
      }),
      memoryKey: "chat_history",
      returnMessages: true,
      maxTokenLimit: 2000,
    });

    // Create conversational chain
    conversationChain = ConversationalRetrievalQAChain.fromLLM(
      llm,
      vectorStore.asRetriever({
        k: 3, // Number of documents to retrieve
      }),
      {
        memory,
        qaTemplate: QA_PROMPT.template,
        returnSourceDocuments: true,
      }
    );

    console.log("LangChain components initialized successfully");
  } catch (error) {
    console.error("Error initializing LangChain:", error);
    throw error;
  }
}

// Chat endpoint - keeping your streaming approach but using LangChain under the hood
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage)
      return res.status(400).json({ error: "Message is required" });

    // Initialize LangChain if not already done
    if (!conversationChain) {
      await initLangChain();
    }

    // Update the last active time
    req.session.chat.lastActive = Date.now();

    // Start response headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Track the response for session history
    let fullResponse = "";

    // Call the chain with streaming
    await conversationChain.call(
      { question: userMessage },
      {
        callbacks: [
          {
            handleLLMNewToken(token) {
              // Stream the token to the client
              res.write(`data: ${JSON.stringify({ text: token })}\n\n`);
              fullResponse += token;
            },
            handleLLMEnd() {
              // Add response to session history for tracking
              req.session.chat.history.push({
                role: "user",
                content: userMessage,
              });
              req.session.chat.history.push({
                role: "assistant",
                content: fullResponse,
              });

              // Keep history to a reasonable size
              if (req.session.chat.history.length > 20) {
                req.session.chat.history = req.session.chat.history.slice(-20);
              }

              // Signal the end of the stream
              res.write("data: [DONE]\n\n");
              res.end();
            },
            handleLLMError(error) {
              console.error("Error in LLM response:", error);
              res.write(
                `data: ${JSON.stringify({
                  text: "\nI'm sorry, there was an error generating a response. Please try again.",
                })}\n\n`
              );
              res.write("data: [DONE]\n\n");
              res.end();
            },
          },
        ],
      }
    );
  } catch (error) {
    console.error("Error generating response:", error);
    // If headers haven't been sent yet, send a regular JSON error
    if (!res.headersSent) {
      return res.status(500).json({ error: "Error generating response" });
    }
    // Otherwise, send an error in the stream format
    res.write(
      `data: ${JSON.stringify({
        text: "\nI'm sorry, there was an error processing your request. Please try again.",
      })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await initLangChain();
    console.log("LangChain initialized successfully");
  } catch (error) {
    console.error("Failed to initialize LangChain:", error);
  }
});