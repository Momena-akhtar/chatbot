import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "langchain/vectorstores/faiss";
import { ConversationSummaryBufferMemory } from "langchain/memory";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import { PromptTemplate } from "langchain/prompts";


import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import session from "express-session";

import { RedisStore } from "connect-redis";
import Redis from "ioredis";
import path from "path";
import fs from "fs";

const __dirname = path.resolve();

// Configure Redis client for session management
const redisClient = new Redis(process.env.REDIS_URL);

// Configure Express application
const app = express();
app.use(express.json());
app.use(cors());
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
      secure: process.env.NODE_ENV === "production",
    },
  })
);

// Initialize paths to knowledge base
const VECTOR_DB_PATH = path.join(__dirname, "utils/kb/vector-db");
const METADATA_PATH = path.join(__dirname, "utils/kb/chunks-metadata.json");

// Initialize chat session management
app.use((req, res, next) => {
  if (!req.session.chat) {
    req.session.chat = {
      history: [],
      lastActive: Date.now(),
    };
  }
  next();
});

// Middleware to handle session expiration
app.use((req, res, next) => {
  if (
    req.session.chat &&
    Date.now() - req.session.chat.lastActive > 1000 * 60 * 30
  ) {
    req.session.destroy();
    return res.status(440).json({ error: "Session expired" });
  }
  next();
});
// Root endpoint
app.get("/", (req, res) => {
  res.send("Chatbot API is running!");
});

// LangChain components
let vectorStore;
let conversationChain;
let memory
// Enhanced prompt template specifically designed to use context properly
const ENHANCED_QA_PROMPT = new PromptTemplate({
  template: `
You are an expert AI assistant specialized in sales, scaling, systems, and hiring, providing helpful, clear, and engaging answers.

CONTEXT FROM KNOWLEDGE BASE:
{context}

CHAT HISTORY:
{chat_history}

USER QUESTION:
{question}

INSTRUCTIONS:
1. Answer based ONLY on the provided context whenever relevant information exists.
2. Do not use phrases like "based on the provided context" or "there is no information"—instead, seamlessly integrate the knowledge you have.
2. If it is a simple greeting message like Hi, Hello, Good morning, greet them  in a friendly way and ask if they need assistance in your specialities.
2. If the context lacks relevant information, use the chat history to find clues for a meaningful answer.
3. If neither context nor chat history fully answers the question, respond using your general knowledge in a friendly, conversational, and helpful manner—avoid generic or bland disclaimers.
4. Do NOT repeat or paraphrase the user's question.
5. Provide direct, specific, and detailed answers.
6. When quoting from the context, use exact phrases.
7. Structure your response clearly, using bullet points or numbered lists where appropriate.
8. Suggest relevant follow-up questions or next steps to keep the conversation engaging.
9. Maintain a positive and conversational tone to enhance user experience.
11. if you encounter pronous like "I" or "we" in the context, you should know that it is Saddam Hassan and his agency, and you are providing his advice to the user.
12. If the question is ambiguous or broad, ask for clarification or narrow down the topic with suggestions.

YOUR RESPONSE:`,
  inputVariables: ["context", "chat_history", "question"],
});

async function initLangChain() {
  try {
    console.log("Initializing LangChain components...");
    
    // Initialize OpenAI embeddings
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    // Check for existing vector index files
    if (fs.existsSync(VECTOR_DB_PATH)) {
      vectorStore = await FaissStore.load(VECTOR_DB_PATH, embeddings);
      console.log("Vector store loaded successfully.");
    } else {
      // Create vector store from source data if no index exists
      if (!fs.existsSync(METADATA_PATH)) {
        throw new Error(`Metadata file not found at: ${METADATA_PATH}`);
      }
      
      const { metadata, texts } = JSON.parse(
        fs.readFileSync(METADATA_PATH, "utf-8")
      );
      
      if (!texts || !texts.length) {
        throw new Error("No text chunks found in metadata file");
      }
      
      // Create document objects
      const documents = texts.map((text, i) => ({
        pageContent: text,
        metadata: metadata[i] || {},
      }));
      
      // Create and save vector store
      vectorStore = await FaissStore.fromDocuments(documents, embeddings);
      await vectorStore.save(VECTOR_DB_PATH);
      console.log("Vector store created and saved successfully.");
    }
    
    // Initialize language model
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo-16k",
      streaming: true,
      temperature: 0.5,
    });
    
    // Create memory for conversation history
    memory = new ConversationSummaryBufferMemory({
      llm: new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-3.5-turbo",
        temperature: 0.5,
        streaming: true,
      }),
      memoryKey: "chat_history",
      returnMessages: true,
      maxTokenLimit: 2000,
      inputKey: "question", 
      outputKey: "text",
    });
    
    // Create the QA chain
    conversationChain = ConversationalRetrievalQAChain.fromLLM(
      llm,
      vectorStore.asRetriever({
        k: 3,
        searchType: "similarity",
      }),
      {
        memory,
        returnSourceDocuments: true,
        qaChainOptions: {
          type: "stuff",
          prompt: ENHANCED_QA_PROMPT,
        },
      }
    );
    
    console.log("LangChain components initialized successfully.");
    return true;
  } catch (error) {
    console.error("Error initializing LangChain:", error);
    throw error;
  }
}
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    
    if (!userMessage) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    // Initialize LangChain if not already done
    if (!conversationChain) {
      await initLangChain();
    }
    
    // Update session activity time
    req.session.chat.lastActive = Date.now();
    
    // Configure streaming response with correct headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    
    // Send initial heartbeat to establish connection
    res.write(":\n\n");
    
    // Track full response for history
    let fullResponse = "";
    let responseStarted = false;
    let questionPartEnded = false;
    let bufferedTokens = ""
    let ignoreTokens = true; // flag to control token streaming
    // Call the chain with streaming callbacks
    await conversationChain.call(
      { question: userMessage },
      {
        callbacks: [
          {
            handleLLMNewToken(token) {
              if (ignoreTokens) {
              // Check if token indicates start of answer, e.g., after a question mark or specific pattern
              if (token.includes("?")) {
                ignoreTokens = false; // start streaming answer tokens
              } else {
                return; // ignore tokens until answer starts
              }
              }
              // Stream tokens after answer starts
              res.write(`data: ${JSON.stringify({ text: token.replace("?", "") })}\n\n`);
            },
            async handleLLMEnd() {
              if (!responseStarted && bufferedTokens.trim()) {
                res.write(`data: ${JSON.stringify({ text: bufferedTokens })}\n\n`);
              }
            
              // Ensure we're providing the exact output structure that matches memory configuration
              const cleanedResponse = fullResponse.replace(/^.?\?\s/, "");
              await memory.saveContext(
                { question: userMessage },
                { text: cleanedResponse }  // This needs to match the outputKey in memory configuration
              );
              console.log("Memory updated successfully");            

              res.write("data: [DONE]\n\n");
              res.end();
            },
            
            handleLLMError(error) {
              console.error("LLM Error:", error);
              res.write(
                `data: ${JSON.stringify({
                  text: "I'm sorry, there was an error generating a response. Please try again.",
                })}\n\n`
              );
              res.write("data: [DONE]\n\n");
              res.end();
            },
          },
        ]
      }
    );
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    
    // Send error response based on header state
    if (!res.headersSent) {
      return res.status(500).json({ error: "Error processing request" });
    } else {
      res.write(
        `data: ${JSON.stringify({
          text: "I'm sorry, an error occurred while processing your request.",
        })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

// Reset chat history endpoint
app.post("/reset-chat", (req, res) => {
  if (req.session.chat) {
    req.session.chat.history = [];
    req.session.chat.lastActive = Date.now();
  }
  res.json({ success: true, message: "Chat history reset" });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    vectorStore: !!vectorStore,
    chain: !!conversationChain
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await initLangChain();
    console.log("LangChain initialized and ready to use");
  } catch (error) {
    console.error("Failed to initialize LangChain:", error);
  }
});