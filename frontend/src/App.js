import React, { useState } from "react";
import AuthPageWithNavigate from "./components/pages/AuthPage";
import Dashboard from "./components/pages/Dashboard";

const App = () => {
  // const [isLoggedIn, setIsLoggedIn] = useState(false);

  // // Handler to toggle the login state
  // const handleLogin = () => {
  //   setIsLoggedIn(true);
  // };

  return (
    <div>
      {/* {isLoggedIn ? (
        <Dashboard />
      ) : (
        <AuthPageWithNavigate onLogin={handleLogin} />
      )} */}
      <Dashboard />
    </div>
  );
};

export default App;
