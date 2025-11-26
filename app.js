import { auth, db } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* --- 1. UI INJECTION SYSTEM --- */
// Allows us to maintain one sidebar code for all pages
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

    // Only inject sidebar if it doesn't exist
    if (!document.getElementById('sidebar')) {
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    }
    
    // NOTE: The injection of the status indicator into the topbar has been removed here.

    // Logic for Sidebar Toggle
    const menuIcon = document.querySelector('.hamburger'); // Works for both pages
    const closeIcon = document.getElementById('closeIcon');
    const sidebar = document.getElementById('sidebar');

    if (menuIcon) {
        menuIcon.addEventListener('click', () => sidebar.classList.add('open'));
    }
    if (closeIcon) {
        closeIcon.addEventListener('click', () => sidebar.classList.remove('open'));
    }
}

/* --- 2. AUTHENTICATION SERVICE (Silent Login) --- */
// Auto-login user anonymously so they can read/write to database immediately
function initAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("User logged in:", user.uid);
            window.currentUser = user;
            // Dispatch event for pages waiting for auth
            window.dispatchEvent(new CustomEvent('auth-ready', { detail: user }));
        } else {
            signInAnonymously(auth).catch((error) => console.error("Auth Failed", error));
        }
    });
}

/* --- 3. DATABASE HELPER FUNCTIONS --- */
// Exported globally so HTML pages can use them easily
window.AriesDB = {
    async getProjects() {
        if(!auth.currentUser) return [];
        const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async createProject(name) {
        if(!auth.currentUser) return;
        const docRef = await addDoc(collection(db, "projects"), {
            name: name,
            createdAt: serverTimestamp(),
            status: 'Active',
            owner: auth.currentUser.uid,
            nodes: [], // Empty workspace
            links: []
        });
        return docRef.id;
    },

    async loadProjectData(projectId) {
        const docRef = doc(db, "projects", projectId);
        const snap = await getDoc(docRef);
        if (snap.exists()) return snap.data();
        return null;
    },

    async saveProjectWorkspace(projectId, nodes, links) {
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
    initAuth();
});
