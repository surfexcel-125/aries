// This file contains the configuration for your Firebase project.
// DO NOT COMMIT THIS FILE TO A PUBLIC REPOSITORY WITH REAL KEYS.

// Replace these placeholders with your actual Firebase configuration values
const firebaseConfig = {
  apiKey: "AIzaSyCfEZ4gJEMFfwCBq7N4XecRli0qCAThyCE",
  authDomain: "aries-48190.firebaseapp.com",
  projectId: "aries-48190",
  storageBucket: "aries-48190.firebasestorage.app",
  messagingSenderId: "1030954306592",
  appId: "1:1030954306592:web:1242fdf52c9b2107424045"
};
// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize services we will use
const auth = firebase.auth();
const db = firebase.firestore();

// Export services for use in scripts.js
export { auth, db };