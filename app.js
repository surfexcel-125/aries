// app.js — central bootstrap + AriesDB API
}, 10000);


onAuthStateChanged(auth, (user) => {
if (user) {
clearTimeout(timeout);
settled = true;
window.currentUser = user;
resolve(user);
} else {
signInAnonymously(auth).catch(err => {
clearTimeout(timeout);
settled = true;
console.error('Anonymous sign-in failed', err);
reject(err);
});
}
});
});


/* --- 1. UI LAYOUT INJECTION --- */
function injectLayout() {
if (document.getElementById('aries-layout')) return;


const html = `
<div id="aries-layout">
<header class="topbar">
<button class="hamburger" aria-label="Open menu">☰</button>
<div class="brand">ARIES</div>
<img src="images/goat.png" class="logo" alt="Aries logo">
</header>
</div>`;


document.body.insertAdjacentHTML('afterbegin', html);


const menu = document.querySelector('.hamburger');
if (menu) menu.addEventListener('click', () => {
document.getElementById('sidebar')?.classList.toggle('open');
});
}


document.addEventListener('DOMContentLoaded', injectLayout);


/* --- 2. AriesDB — small facade for pages to use (waits for auth) --- */
window.AriesDB = {
async getProjects() {
await authPromise;
const q = query(collection(db, 'projects'), orderBy('createdAt','desc'));
const snap = await getDocs(q);
return snap.docs.map(d => ({ id: d.id, ...d.data() }));
},


async createProject(name) {
await authPromise;
const ref = await addDoc(collection(db,'projects'), {
name, status: 'Active', owner: window.currentUser?.uid || null, createdAt: serverTimestamp(), nodes: [], links: []
});
return ref.id;
},


async loadProjectData(projectId) {
await authPromise;
const ref = doc(db, 'projects', projectId);
const s = await getDoc(ref);
return s.exists() ? s.data() : null;
},


async saveProjectWorkspace(projectId, nodes, links) {
await authPromise;
const ref = doc(db,'projects',projectId);
await updateDoc(ref, { nodes: nodes||[], links: links||[], lastModified: serverTimestamp() });
}
};


export { authPromise };
