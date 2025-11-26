import { auth, db } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* --- 0. AUTH PROMISE (Crucial for reliable loading) --- */
// This promise resolves ONLY after the Firebase user is available (signed in anonymously or existing).
const authPromise = new Promise(resolve => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("User logged in:", user.uid);
            window.currentUser = user;
            resolve(user);
        } else {
            // If no user, sign in anonymously and then wait for the next onAuthStateChanged update
            signInAnonymously(auth).catch((error) => console.error("Auth Failed", error));
        }
    });
});


/* --- 1. UI INJECTION SYSTEM --- */
// Injects the sidebar into the DOM of every page
function injectLayout() {
    const sidebarHTML = `
    <div id="sidebar" class="sidebar">
        <div class="sidebar-header">
            <span id="closeIcon" class="close-icon">&#10094;</span> 
        </div>
        <a href="index.html" class="sidebar-button">DASHBOARD</a>
        <a href="projects.html" class="sidebar-button">PROJECTS</a>
        <a href="#" class="sidebar-button">SETTINGS</a>
    </div>`;

    if (!document.getElementById('sidebar')) {
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    }

    const menuIcon = document.querySelector('.hamburger');
    const closeIcon = document.getElementById('closeIcon');
    const sidebar = document.getElementById('sidebar');

    if (menuIcon) {
        menuIcon.addEventListener('click', () => sidebar.classList.add('open'));
    }
    if (closeIcon) {
        closeIcon.addEventListener('click', () => sidebar.classList.remove('open'));
    }
}

/* --- 2. DATABASE HELPER FUNCTIONS (Now relying on authPromise) --- */
window.AriesDB = {
    async getProjects() {
        // This line PAUSES execution until Firebase is ready
        await authPromise; 
        
        const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async createProject(name) {
        await authPromise;
        
        const docRef = await addDoc(collection(db, "projects"), {
            name: name,
            createdAt: serverTimestamp(),
            status: 'Active',
            owner: window.currentUser.uid, // Use the resolved user ID
            nodes: [], 
            links: []
        });
        return docRef.id;
    },

    async loadProjectData(projectId) {
        // Data loading doesn't strictly need to wait for auth, but we keep the helper centralized
        const docRef = doc(db, "projects", projectId);
        const snap = await getDoc(docRef);
        if (snap.exists()) return snap.data();
        return null;
    },

    async saveProjectWorkspace(projectId, nodes, links) {
        await authPromise;
        
        const docRef = doc(db, "projects", projectId);
        await updateDoc(docRef, {
            nodes: nodes,
            links: links,
            lastModified: serverTimestamp()
        });
    }
};

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    injectLayout();
});
