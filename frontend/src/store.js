const store = {
   
    // Initialize users from localStorage or start with an empty array
    users: JSON.parse(localStorage.getItem("users")) || [],
    
    addUser(username, password) {
        // First check if the user already exists in the list
        if (this.getUser(username)) {
            return false; // Account already exists
        }
        
        // Add the new user to the list
        this.users.push({ username, password });
        this.saveToLocalStorage(); // Persist changes to localStorage
        return true;
    },

    getUser(username) {
        return this.users.find(user => user.username === username);
    },

    removeUser(username) {
        this.users = this.users.filter(user => user.username !== username);
        this.saveToLocalStorage(); // Persist changes to localStorage
    },

    saveToLocalStorage() {
        localStorage.setItem("users", JSON.stringify(this.users));
    }
    //delete user with the name momena

};

export default store;
