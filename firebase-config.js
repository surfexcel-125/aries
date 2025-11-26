// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfEZ4gJEMFfwCBq7N4XecRli0qCAThyCE",
  authDomain: "aries-48190.firebaseapp.com",
  projectId: "aries-48190",
  storageBucket: "aries-48190.firebasestorage.app",
  messagingSenderId: "1030954306592",
  appId: "1:1030954306592:web:1242fdf52c9b2107424045"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
