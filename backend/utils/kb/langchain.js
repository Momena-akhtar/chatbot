//import necessary packages
import { ChatOpenAI } from "@langchain/openai"; //for establishing connection ?
import { OpenAIEmbeddings } from "@langchain/openai";  //for creating embeddings
import { FaissStore } from "langchain/vectorstores/faiss"; //for storing embeddings
import { ConversationSummaryBufferMemory } from "langchain/memory"; //for maintaining memory
import { ConversationalRetrievalQAChain } from "langchain/chains"; //for chaining LLM and embedding models and stuff
import { PromptTemplate } from "langchain/prompts"; //for specifying a prompt template for the model

//environment dependencies
import dotenv from "dotenv" //for environment variables
dotenv.config()  

//for setting up backend
import express from "express"
import cors from "cors"

//for creating session
import session from "express-session"; 
import { RedisStore } from "connect-redis";  //for storing memory
import Redis from "ioredis";

//other dpendencies
import path from "path";  //for creating paths
import fs from "fs"  //for reading files

//rsolve the current directory name
const __dirname = path.resolve()

//make a redis client for session
const redisClient = new Redis({
  host: "127.0.0.1"  //local host
  ,port : 6379  //default port
})

//configure the express application
const app = new express()
app.use(express.json())
app.use(cors())

//create a session
app.use(
  session({
    store: new RedisStore( {client: redisClient} ),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, //2 hours
      secure: process.env.NODE_ENV === "production"
    }
}))

//initialize paths to the knowledge base
const VECTOR_DB_PATH = path.join(__dirname, "utils/kb/vector-db");
const METADATA_PATH = path.join(__dirname, "utils/kb/chunks-metadata.json");

//initialize app session management
app.use((req, res, next) => {
  if (!req.session.chat){
    req.session.chat = {
      history: [],
      lastActive: Date.now()
    }
  }
  next()
})

//middle ware
app.use((req, res, next) => {
  if (
    req.session.chat &&
    Date.now() - req.session.chat.lastActive > 1000 * 60 * 30
  ) {
    req.session.destroy();
    return res.status(440).json({ error: "Session expired" });
  }
   //Update activity timestamp
   if (req.session.chat) {
    req.session.chat.lastActive = Date.now();
  }
  next();
});
// Root endpoint
app.get("/", (req, res) => {
  res.send("Chatbot API is running!");
});

//initialze langchain components
let vectorStore
let conversationChain;
let memory;

//initialize a prompt template
const ENHANCED_QA_PROMPT = new PromptTemplate({
  template: `
You are a top-tier AI assistant trained on Saddam Hassan’s expertise in sales, systems, hiring, and scaling businesses. You provide engaging, specific, and actionable responses.

## CONTEXT:
{context}

## CHAT HISTORY:
{chat_history}

## USER QUESTION:
{question}

## INSTRUCTIONS:
1. If the user's input is a simple greeting (e.g., "hi", "hello", "hey", "good morning", etc.), treat it as the start of a conversation. Respond with:
   - A warm, friendly greeting.
   - An offer to help with sales, hiring, systems, or scaling.
   - DO NOT introduce yourself or say you're an AI unless explicitly asked.

   Example:
   - "Hey there! 👋 How can I help you today with anything around sales, systems, hiring, or scaling?"

2. Use the context to answer only when relevant. Quote exact phrases when needed.
3. If context lacks answers, use chat history to infer meaningful responses.
4. If neither context nor history is enough, give high-quality general advice, but avoid empty disclaimers.
5. DO NOT repeat or paraphrase the user’s question.
6. Give clear, structured answers (use bullet points or steps).
7. Suggest helpful follow-up questions or next steps.
8. Keep the tone positive, conversational, and human-like — not robotic.
9. Avoid saying “based on the provided context” or similar phrases. Just respond naturally.
10. If the user uses pronouns like “I” or “we” in the context, they refer to Saddam Hassan and his agency. You are presenting his advice on his behalf.
11. If the question is vague or broad, ask for clarification with specific options.

## RESPONSE:
`,
  inputVariables: ["context", "chat_history", "question"],
});
async function initLangChain() {
  try {
    console.log("[LangChain] Initializing components...");

    // Initialize OpenAI embeddings
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Load or create FAISS vector store
    if (fs.existsSync(VECTOR_DB_PATH)) {
      vectorStore = await FaissStore.load(VECTOR_DB_PATH, embeddings);
      console.log("[LangChain] Vector store loaded from disk.");
    } else {
      if (!fs.existsSync(METADATA_PATH)) {
        throw new Error(`Metadata file not found at: ${METADATA_PATH}`);
      }

      const { metadata, texts } = JSON.parse(
        fs.readFileSync(METADATA_PATH, "utf-8")
      );

      if (!texts || !texts.length) {
        throw new Error("No text chunks found in metadata file.");
      }

      const documents = texts.map((text, index) => ({
        pageContent: text,
        metadata: metadata[index] || {},
      }));

      vectorStore = await FaissStore.fromDocuments(documents, embeddings);
      await vectorStore.save(VECTOR_DB_PATH);
      console.log("[LangChain] Vector store created and saved.");
    }

    // Initialize main LLM for answers
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo-16k",
      streaming: true,
      temperature: 0.5,
    });

    // Memory LLM for summaries
    memory = new ConversationSummaryBufferMemory({
      llm: new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-3.5-turbo",
        temperature: 0,
      }),
      memoryKey: "chat_history",
      returnMessages: true,
      maxTokenLimit: 2000,
      inputKey: "question",
      outputKey: "text",
    });

    // Wrap retriever for future tuning flexibility
    const retriever = vectorStore.asRetriever({
      k: 3,
      searchType: "similarity",
    });

    // Build the conversational chain
    conversationChain = ConversationalRetrievalQAChain.fromLLM(
      llm,
      retriever,
      {
        memory,
        returnSourceDocuments: true,
        qaChainOptions: {
          type: "stuff",
          prompt: ENHANCED_QA_PROMPT,
        },
      }
    );

    // Optional health-check call
    try {
      await conversationChain.call({ question: "ping" });
      console.log("[LangChain] Model passed health check.");
    } catch (pingError) {
      console.warn("[LangChain] Health check failed:", pingError.message);
    }

    console.log("[LangChain] Initialization complete.");
    return true;
  } catch (error) {
    console.error("[LangChain] Initialization error:", error.message);
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
              res.write(`data: ${JSON.stringify({ text: token.replace("?","") })}\n\n`);
            },
            async handleLLMEnd() {
              if (!responseStarted && bufferedTokens.trim()) {
              res.write(`data: ${JSON.stringify({ text: bufferedTokens })}\n\n`);
              }
            
                await memory.saveContext(
                { question: userMessage },
                { text: fullResponse.replace(/^.*?\?\s*/, "")} 
                );
              console.log("memory: ", memory )            

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