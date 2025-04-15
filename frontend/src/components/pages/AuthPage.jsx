import React, { Component } from "react";
import store from "../../store";
import { useNavigate } from "react-router-dom";

export default class AuthPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      username: "",
      password: "",
      error: "",
      isSignup: false, // Toggle between login and signup
    };
  }

  handleInputChange = (e) => {
    const { name, value } = e.target;
    this.setState({ [name]: value });
  };

  handleLogin = () => {
    const { username, password } = this.state;
  
    // Check if user exists in the store
    const user = store.getUser(username);
  
    if (user && user.password === password) {
          // Show success message
      this.setState({ error: "Login Successful!" });
      setTimeout(() => {
        this.props.onLogin(); // Trigger global login state
      }, 1000); // 1.5 seconds delay (adjust as needed)
    } 
    else {
      this.setState({ error: "Invalid username or password" });
    }
  };
  
  handleSignup = () => {
    const { username, password } = this.state;
  
    // Check if username is already taken
    const existingUser = store.getUser(username);
  
    if (existingUser) {
      this.setState({ error: "Username already exists" });
      return;
    }
  
    // Add the new user to the store
    store.addUser(username, password);
  
    console.log("Signup successful!");
    this.props.onLogin(); // Trigger global login state after signup
  };
  

  toggleMode = () => {
    this.setState((prevState) => ({
      isSignup: !prevState.isSignup,
      error: "",
    }));
  };

  render() {
    const { username, password, error } = this.state;
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#000",
          color: "#fff",
          fontFamily: "'Kumbh Sans', sans-serif",
        }}
      >
         <div
          style={{
            position: "absolute",
            top: "60px",
            textAlign: "center",
            width: "100%",
          }}
        >
          <h1
            style={{
               fontSize: "2rem",
              fontWeight: "bold",
              background: "linear-gradient(90deg, #ff7f50, #ff1493, #1e90ff, #32cd32)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              margin: 0,
              
            }}
          >
            Hello, there!
          </h1>
        </div>
        <div
          style={{
            backgroundColor: "#1a1a1a",
            padding: "20px 40px",
            borderRadius: "10px",
            boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.64)",
            textAlign: "center",
            width: "290px",
          }}
        >
          <h1 style={{ marginBottom: "20px", fontSize: "20px" }}>
          {this.state.isSignup ? "Signup for an account" : "Login to your account"}
        </h1>
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={username}
            onChange={this.handleInputChange}
            style={{
              width: "100%",
              padding: "10px",
              margin: "10px 0",
              borderRadius: "5px",
              border: "1px solid #555",
              backgroundColor: "#2c2c2c",
              color: "#fff",
              fontFamily: "'Kumbh Sans', sans-serif",
            }}
          />
          <input
          type="password"
            name="password"
            placeholder="Password"
            value={password}
            onChange={this.handleInputChange}
            style={{
             width: "100%",
              padding: "10px",
              margin: "10px 0",
              borderRadius: "5px",
              border: "1px solid #555",
              backgroundColor: "#2c2c2c",
              fontFamily: "'Kumbh Sans', sans-serif",
              color: "#fff",
            }}
          />
          {error && (
          <p style={{ color: error === "Login Successful!" ? "green" : "red" }}>
            {error}</p>)}

          <button
          onClick={this.state.isSignup ? this.handleSignup : this.handleLogin}
            style={{
                width: !this.state.isSignup ? "45%" : "70%",
              padding: "10px",
              marginTop: "10px",
              borderRadius: "20px",
              border: "none",
              background: "linear-gradient(90deg,rgba(10, 41, 71, 0.64),rgba(63, 17, 90, 0.53))",
              color: "#fff",
              cursor: "pointer",
              fontSize: "20px",
              fontFamily: "'Kumbh Sans', sans-serif",
              //on hover
            
            }}
          >
            {this.state.isSignup ? "Create Account" : "Login"}  {/* Change button text */}
          </button>
          
            <p style={{ marginTop: "20px", fontSize: "16px" }}>
            {this.state.isSignup ? (
                <>
                Already have an account? <a href="#" onClick={this.toggleMode} style={{ color: "rgba(110, 28, 158, 0.99)" }}>Login</a>
                </>
            ) : (
                <>
                Don’t have an account? <a href="#" onClick={this.toggleMode} style={{ color: "rgba(110, 28, 158, 0.99)" }}>Sign up</a>
                </>
            )}
            </p>
          <div>
            <p>Or</p>
        </div>
        <div>
            <button
                style={{
                    width: "80%",
                    padding: "10px",
                    marginTop: "10px",
                    borderRadius: "25px",
                    border: "1px solid #fff",  // Lined border
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "17px",
                    fontFamily: "'Kumbh Sans', sans-serif",
                    backgroundColor: "transparent",  // No background color
                    transition: "0.5s ease-in-out",
                }}
            >
                <img
        src="https://img.icons8.com/color/48/ffffff/google-logo.png"  // Colorful Google icon URL
        alt="Google"
        style={{
            width: "18px",
            marginRight: "10px",
            marginLeft: "5px",
            marginBottom: "1px",
            verticalAlign: "middle",  // Align the icon vertically in the middle
        }}
    />
                Continue with Google
            </button>
        </div>
        </div>
        
      </div>
    );
  }
}
export function AuthPageWithNavigate() {
    const navigate = useNavigate();
    return <AuthPage navigate={navigate} />;
  }
  