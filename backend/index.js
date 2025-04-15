require("dotenv").config();
const { OpenAI } = require("openai");
const express = require("express");
const { generateEmbeddings } = require("./utils/kb/embedding_script");
const cors = require("cors");
const session = require("express-session");

const app = express();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    basePath: "https://api.openai.com/v1", // Optional, if you use the default endpoint.
    defaultModel: "gpt-3.5-turbo", 
  });


    const summarizeChat = async (history, prevSummary) => {
        const prompt = `
          You are an AI assistant tasked with summarizing the following chat history.
          Preserve the core intent, facts, and context. Avoid redundant phrasing.
      
          Previous Summary:
          ${prevSummary || "None"}
      
          New Exchanges:
          ${history
            .map((h, i) => `(${i + 1}) ${h.role.toUpperCase()}: ${h.content}`)
            .join("\n")}
      
          Return the updated summary below:
        `;
        
        // Request summary from OpenAI API (GPT-3.5 Turbo)
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        });
      
        return response.choices[0].message.content;
      };

app.use(express.json());
app.use(cors());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
      secure: false,
    }, // Set to true if using HTTPS
  })
);

//middlewre to initialize chat session
app.use((req, res, next) => {
  if (!req.session.chat) {
    req.session.chat = {
      history: [],
      summary: "",
      originalContext: "",
      lastActive: Date.now(),
    };
  }
  next();
});
//middleware to handle chat expiration
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

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage)
      return res.status(400).json({ error: "Message is required" });

    // Update the last active time
    req.session.chat.lastActive = Date.now();

    //add user message to history
    req.session.chat.history.push({ role: "user", content: userMessage });

    // summarization checkpoint every 4 exchanges (user+AI)
    if (req.session.chat.history.length >=6) {
      const newSummary = await summarizeChat(
        req.session.chat.history,
        req.session.chat.summary
      );
      req.session.chat.summary = newSummary;
      req.session.chat.history = []; // clear after summarization
    }

    //fetch context from the knowledge base
    const kbResponse = await generateEmbeddings(userMessage);

    // Construct the context prompt by combining the context from the knowledge base
    console.log(kbResponse[0]);
    let context = "";

    // Iterate over the results and append the `context` field to the `context` variable
    kbResponse.forEach((item) => {
      context += item.context + "\n"; // Append the context of each result
    });
    const guidelinePrompt = `
            You are an AI assistant with access to context retrieved from a knowledge base. Follow these rules:

            1. Use the provided context to answer the user's question as precisely as possible. If the context is not there, give a general answer based on your own knowledge.
            2. If context is irrelevant or insufficient, don't say so clearly. Instead, provide a general answer based on your knowledge and surrounding context.
            3. Do not make up facts.
            4. If inferring, say you are inferring.
            5. Format responses clearly. Use bullet points or short paragraphs.
            6. Be complete yet concise, helpful, and professional.

            --- Knowledge Base Context ---
            ${context}
        `.trim();

    // Construct full prompt from:
    // 1. summary
    // 2. last 3 exchanges (for recency)
    // 3. new question
    const recentExchanges = req.session.chat.history
      .slice(-6)
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n");

    const fullPrompt = `
                ${guidelinePrompt}

                --- Chat Summary ---
                ${req.session.chat.summary || "None"}

                --- Recent Chat ---
                ${recentExchanges}

                --- New Question ---
                USER: ${userMessage}
        `.trim();

     // OpenAI API: Request a response from GPT-3.5 Turbo using streaming
     const stream = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: fullPrompt }],
        stream: true,
      });

    // Start response headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");


       // Process the stream chunks as they arrive
       for await (const chunk of stream) {
        const chunkText = chunk.choices[0]?.delta?.content;
        if (chunkText) {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      }
  

    // Signal the end of the stream
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Error generating response:", error);
    res.status(500).json({ error: "Error generating response" });
  }
});

app.listen(5000, () => console.log("Backend running on port 5000"));
