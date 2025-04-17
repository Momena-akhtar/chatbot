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


app.get("/", (req, res) => {
  res.send(" Server is running ")
})

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