import React, { useState, useEffect } from "react";
import './Dashboard.css';
import { motion } from "framer-motion";
import { FaChartLine, FaHandshake, FaComments } from "react-icons/fa"; // Import icons
import ReactMarkdown from "react-markdown";
import "font-awesome/css/font-awesome.min.css";

const Dashboard = () => {
  const [chatStarted, setChatStarted] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [fullBotMessage, setFullBotMessage] = useState("");
  const [displayedBotMessage, setDisplayedBotMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const suggestions = [
    {
      text: "What should my profit margins be?",
      icon: <FaChartLine size={20} />,
    }, // Profit icon
    {
      text: "How do I get clients to sign long-term contracts?",
      icon: <FaHandshake size={23} />,
    }, // Handshake icon
    {
      text: "How do I break a client's price-first mindset?",
      icon: <FaComments size={20} />,
    }, // Dollar icon
  ];

  const getRandomSuggestions = () => {
    const shuffled = [...suggestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  };

  const [randomSuggestions, setRandomSuggestions] = useState([]);

  useEffect(() => {
    setRandomSuggestions(getRandomSuggestions());
  }, []);

  const handleSend = async () => {
    if (!userInput) return;

    const userMessage = { text: userInput, sender: "user" };
    setChatStarted(true);
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    setUserInput(""); // Clear input box after sending

    setFullBotMessage("");
    setDisplayedBotMessage("");
    setIsTyping(true);

    try {
      // Add empty bot message at first
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          text: "",
          sender: "bot",
        },
      ]);
      const response = await fetch("https://saddam-chatbot.onrender.com/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userInput }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decodedChunk = decoder.decode(value, { stream: true });
        const lines = decodedChunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.replace("data: ", "");

            // Check if it's the end marker
            if (data === "[DONE]") continue;

            try {
              const parsedData = JSON.parse(data);
              if (parsedData.text) {
                // Update the full message with new chunks
                setFullBotMessage((prev) => prev + parsedData.text);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e, data);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { text: "Error: Failed to get response", sender: "system" },
      ]);
    } finally {
      setIsTyping(false);
    }
  };
  useEffect(() => {
    // Early return if typing is complete
    if (!isTyping && fullBotMessage === displayedBotMessage) return;

    // Define the typing speed - adjust as needed
    const typingSpeed = 15; // milliseconds per character

    // Calculate how many characters to show in the next update
    const currentLength = displayedBotMessage.length;
    const targetLength = Math.min(currentLength + 3, fullBotMessage.length);

    if (currentLength < fullBotMessage.length) {
      const timer = setTimeout(() => {
        setDisplayedBotMessage(fullBotMessage.substring(0, targetLength));

        // Update the message in the messages array
        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          const isComplete = targetLength >= fullBotMessage.length;

          newMessages[newMessages.length - 1] = {
            text: (
              <motion.div
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <ReactMarkdown>
                  {fullBotMessage.substring(0, targetLength)}
                </ReactMarkdown>
                {/* Only show cursor if we're still typing and not at the end */}
                {!isComplete && (
                  <motion.span
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="typing-indicator"
                    style={{ marginLeft: "2px" }}
                  >
                    ▋
                  </motion.span>
                )}
              </motion.div>
            ),
            sender: "bot",
          };
          return newMessages;
        });
      }, typingSpeed);

      return () => clearTimeout(timer);
    }
  }, [fullBotMessage, displayedBotMessage, isTyping]);

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && userInput.trim()) {
      handleSend();
    }
  };

  const scrollToBottom = () => {
    const chatContainer = document.getElementById("chat-container");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  };

  useEffect(() => {
    if (messages.length > 0 && !messages[messages.length - 1].isPending) {
      scrollToBottom();
    }
  }, [messages]);

  return (
    <div>
      <h1
        style={{
          marginTop: "10px",
          marginLeft: "20px",
          position: "absolute",
          color: "#fff",
          fontSize: "18px",
          fontFamily: "'Kumbh Sans', sans-serif",
          cursor: "pointer",
        }}
      ></h1>

      {/* BACK BUTTON */}
      {chatStarted && (
        <button
          style={{
            position: "absolute",
            top: "10px",
            left: "20px",
            backgroundColor: darkMode ? "#2c2c2c" : "#fff",
            color: darkMode ? "#fff" : "#000",
            border: "solid 1px rgba(180, 180, 180, 0.55)",
            borderRadius: "50px",
            padding: "5px 10px",
            fontSize: "14px",
            fontFamily: "'Kumbh Sans', sans-serif",
            cursor: "pointer",
          }}
          onClick={() => {
            setChatStarted(false);
            setMessages([]); // Clear messages when going back
          }}
        >
          <i className="fa fa-arrow-left" style={{ marginRight: "5px" }}></i>
        </button>
      )}
      {/* DARK MODE TOGGLE ICON */}
      <div
      className="toggle-button"
        style={{
          position: "absolute",
          top: "12px",
          right: "120px", // Align to the right, beside the user icon
          cursor: "pointer",
          color: "#fff",
          fontSize: "18px",
          transition: "0.3s ease-in-out",
        }}
        onClick={() => setDarkMode(!darkMode)}
      >
        {darkMode ? (
          <i className="fa fa-sun-o" style={{ color: "#fff" }}></i> // Sun icon for dark mode
        ) : (
          <i className="fa fa-moon-o" style={{ color: "#000" }}></i> // Moon icon for light mode
        )}
      </div>
      {/* USER */}
      <div
      className="user-button"
        style={{
          position: "absolute",
          top: "10px",
          right: "20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          border: darkMode
            ? "1px solid #2c2c2c"
            : "1px solid rgb(194, 194, 194)",
          borderRadius: "50px",
          padding: "5px 15px",
          cursor: "pointer",
        }}
      >
        {/*USER ICON*/}
        <i
          className="fa fa-user"
          style={{
            color: darkMode ? "#fff" : "#000",
            fontSize: "18px",
            cursor: "pointer",
          }}
        ></i>
        <span
          style={{
            color: darkMode ? "#fff" : "#000",
            fontSize: "14px",
            fontFamily: "'Kumbh Sans', sans-serif",
          }}
        >
          User
        </span>
      </div>
      {/*MAIN CONTAINER */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            maxHeight: "100vh",
            backgroundColor: darkMode ? "#333" : "#fff",
            color: darkMode ? "#fff" : "#000",
            fontFamily: "'Kumbh Sans', sans-serif",
          }}
        >
          <div
          className="main-container"
            style={{
          width: "80%",
          height: "80%",
          backgroundColor: window.innerWidth > 768 ? (darkMode ? "#1a1a1a" : "rgba(245, 245, 245, 0.36)") : "transparent",
          border: window.innerWidth > 768 ? (darkMode ? "none" : "1px solid #333") : "none",
          padding: "20px 40px",
          borderRadius: window.innerWidth > 768 ? "10px" : "0",
          boxShadow: window.innerWidth > 768 && darkMode ? "0px 4px 10px rgba(0, 0, 0, 0.55)" : "none",
          textAlign: "center",
            }}
          >
            {/* WELCOME HEADING */}
          {!chatStarted && (
            <>
              <h1 style={{ marginTop: "100px"}} className="main-heading">
                AI Powered by Saddam Hassan’s $10M+ Agency Secrets{" "}
              </h1>
              <h2
              className="sub-heading"
                style={{
                 fontWeight: "normal",
                  maxWidth: "50%",
                  color: darkMode ? "rgba(200, 200, 200, 0.8)" : "#000",
                  marginTop: "10px",
                  textAlign: "center", // Centers text
                  marginLeft: "auto", // Centers the block horizontally
                  marginRight: "auto",
                  marginBottom: "15px"
                }}
              >
                Ask anything about scaling, sales, systems, and hiring - this AI
                agent has Saddam’s proven playbook.
              </h2>
            </>
          )}
          <div
            style={{
              display: chatStarted ? "block" : "none", // Initially hidden
              width: "100%",
              height: "490px",
              maxHeight: "87%",
              overflowY: "auto",
              marginBottom: "10px",
              scrollbarWidth: "thin", // For Firefox
              scrollbarColor: "rgba(120, 120, 120, 0.7) transparent",
            }}
            id="chat-container"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.sender === "user" ? "flex-end" : "flex-start", // Align correctly
                  width: "100%",
                  marginBottom: "10px",
                  opacity: 0,
                  transform: "translateY(10px)",
                  animation: "fadeInUp 0.3s ease-in-out forwards",
                }}
              >
                <div
                  style={{
                    backgroundColor:
                      msg.sender === "user"
                        ? "inherit"
                        : darkMode
                        ? "rgba(87, 87, 87, 0.34)"
                        : "rgba(224, 224, 224, 0.34)", // Light gray for user, dark gray for model
                    textAlign: "left",
                    marginLeft: "10px",
                    marginRight: "15px",
                    color: "inherit",
                    border: darkMode
                      ? "1px solid #2c2c2c"
                      : "1px solid rgba(173, 172, 172, 0.34)",
                    padding: "10px",
                    borderRadius: "30px",
                    maxWidth: "60%",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <style>
              {`
                        @keyframes fadeInUp {
                            from {
                                opacity: 0;
                                transform: translateY(10px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                        `}
            </style>
          </div>
          <div style={{ position: "relative",}}>
          <input
  className={`input-field ${darkMode ? "dark-mode" : "light-mode"} ${chatStarted ? "compact" : "full-height"}`}
  name="prompt"
  placeholder={ !chatStarted ? "How can I help you today?" : "Ask Follow-up.." }
  value={userInput}
  onChange={(e) => setUserInput(e.target.value)}
  onKeyDown={handleKeyPress}
/>

            {/* SEND RESPONSE BUTTON */}
            <button
            className="send-button"
              style={{
                background: "none",
                border: "none",
                color: darkMode ? "#fff" : "#000",
                fontSize: "20px",
                cursor: "pointer",
              }}
              onClick={() => {
                handleSend();
                }}
                
              >
                <i className="fa fa-paper-plane"
                style={{
                  width: "30px", // Reduced width
                  height: "30px", // Reduced height
                  }}></i>
              </button>
              </div>
              {/* SUGGESTIONS */}
          {!chatStarted && (
            <div
            className="suggestions-container"
              style={{
                marginTop: "auto",
                padding: "20px",
                backgroundColor: "inherit",
                color: darkMode ? "#fff" : "#000",
                textAlign: "center",
                width: "70%",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {/* SUGGESTION CARDS */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "20px",
                  gap: "8px",
                }}
              >
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: "inherit",
                      color: darkMode ? "rgba(226, 226, 226, 0.77)" : "#000",
                      border: "1px solid rgba(87, 87, 87, 0.34)",
                      padding: "3px 10px",
                      borderRadius: "50px",
                      width: "28%",
                      maxHeight: "70px",
                      textAlign: "center",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      // Space between icon and text
                      boxShadow: "0px 1px 2px rgba(17, 17, 17, 0.8)",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setUserInput(suggestion.text); // Set suggestion text in input
                      handleSend(); // Trigger send action
                    }}
                  >
                    {suggestion.icon} {/* Icon */}
                    <p style={{ margin: 0 }}>{suggestion.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* FOOTER */}
      </div>
      <p
      className="footer"
        style={{
          display: chatStarted? "none": "flex",
          position: "absolute",
          bottom: "0",
          left: "50%",
          transform: "translateX(-50%)",
          color: darkMode ? "rgba(163, 159, 159, 0.77)" : "#000",
          fontSize: "14px",
          fontFamily: "'Kumbh Sans', sans-serif",
          textAlign: "center",
        }}
      >
        Copyright &copy; 2025. All Rights Reserved.
      </p>
    </div>
  );
};

export default Dashboard;
