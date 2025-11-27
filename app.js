<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Aries — Sign In</title>
  <style>
    :root {
      --bg: #050505;
      --fg: #f9fafb;
      --muted: #9ca3af;
      --accent: #fafafa;
      --error: #f97373;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
                   "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .auth-shell {
      width: 100%;
      max-width: 420px;
      border-radius: 18px;
      border: 1px solid #111827;
      background: #020617;
      box-shadow:
        0 28px 60px rgba(0,0,0,0.9),
        0 0 0 1px rgba(255,255,255,0.02);
      padding: 24px 22px 20px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      border-radius: 999px;
      border: 1px solid rgba(249,250,251,0.2);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:18px;
      font-weight:800;
    }
    .brand-text-main {
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 0.08em;
    }
    .brand-text-sub {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.16em;
    }
    .headline {
      margin: 0 0 4px 0;
      font-size: 22px;
      font-weight: 700;
    }
    .subheadline {
      margin: 0 0 18px 0;
      font-size: 13px;
      color: var(--muted);
    }
    .mode-toggle {
      display: inline-flex;
      border-radius: 999px;
      padding: 2px;
      border: 1px solid rgba(148,163,184,0.5);
      background: #020617;
      margin-bottom: 16px;
    }
    .mode-toggle button {
      border: none;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 600;
    }
    .mode-toggle button.active {
      background: #f9fafb;
      color: #020617;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    label {
      font-size: 12px;
      color: var(--muted);
      display:block;
      margin-bottom: 2px;
    }
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 9px 10px;
      border-radius: 9px;
      border: 1px solid #111827;
      background: #020617;
      color: var(--fg);
      font-size: 13px;
      outline: none;
    }
    input::placeholder {
      color: #4b5563;
    }
    input:focus {
      border-color: #e5e7eb;
    }
    .error {
      min-height: 18px;
      font-size: 12px;
      color: var(--error);
      margin-top: 2px;
    }
    .submit-row {
      margin-top: 4px;
    }
    .btn-primary {
      width: 100%;
      border-radius: 999px;
      border: 1px solid #f9fafb;
      background: #f9fafb;
      color: #020617;
      font-size: 13px;
      font-weight: 700;
      padding: 9px 12px;
      cursor: pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      gap: 8px;
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .loader {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid rgba(15,23,42,0.4);
      border-top-color: #020617;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .info {
      margin-top: 10px;
      font-size: 11px;
      color: var(--muted);
    }
    .footer {
      margin-top: 18px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      font-size: 11px;
      color: #6b7280;
    }
    .pill {
      border-radius:999px;
      border: 1px solid #111827;
      padding:3px 8px;
      font-size:10px;
      text-transform:uppercase;
      letter-spacing:0.14em;
    }
    @media (max-width: 480px) {
      .auth-shell {
        padding: 20px 16px 16px;
      }
    }
  </style>
</head>
<body>
<div class="auth-shell">
  <div class="brand">
    <div class="brand-mark">A</div>
    <div>
      <div class="brand-text-main">ARIES</div>
      <div class="brand-text-sub">BLACK &amp; WHITE</div>
    </div>
  </div>

  <h1 class="headline">Sign in to Aries</h1>
  <p class="subheadline" id="modeSubtitle">Use your email and password.</p>

  <div class="mode-toggle" role="tablist" aria-label="Auth mode">
    <button type="button" id="modeLogin" class="active" role="tab" aria-selected="true">Sign In</button>
    <button type="button" id="modeSignup" role="tab" aria-selected="false">Create Account</button>
  </div>

  <form id="authForm" novalidate>
    <div>
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" placeholder="you@example.com" required />
    </div>
    <div>
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
    </div>

    <div class="error" id="errorBox"></div>

    <div class="submit-row">
      <button type="submit" id="submitBtn" class="btn-primary">
        <span id="submitText">Sign In</span>
        <span id="submitSpinner" class="loader" style="display:none;"></span>
      </button>
    </div>

    <div class="info">
      Access requires an Aries account. Creating an account is instant and free.
    </div>
  </form>

  <div class="footer">
    <div class="pill">Black &amp; White Mode</div>
    <div>Aries © <span id="year"></span></div>
  </div>
</div>

<script type="module">
  import { auth } from './firebase-config.js';
  import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged
  } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

  const REDIRECT_URL = 'home.html';

  const yearEl = document.getElementById('year');
  yearEl.textContent = new Date().getFullYear().toString();

  const modeLoginBtn = document.getElementById('modeLogin');
  const modeSignupBtn = document.getElementById('modeSignup');
  const modeSubtitle = document.getElementById('modeSubtitle');
  const form = document.getElementById('authForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorBox = document.getElementById('errorBox');
  const submitBtn = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitText');
  const submitSpinner = document.getElementById('submitSpinner');

  let mode = 'login';

  function setMode(newMode) {
    mode = newMode;
    if (mode === 'login') {
      modeLoginBtn.classList.add('active');
      modeSignupBtn.classList.remove('active');
      submitText.textContent = 'Sign In';
      modeSubtitle.textContent = 'Use your email and password.';
    } else {
      modeLoginBtn.classList.remove('active');
      modeSignupBtn.classList.add('active');
      submitText.textContent = 'Create Account';
      modeSubtitle.textContent = 'Create a new Aries account in a few seconds.';
    }
    errorBox.textContent = '';
  }

  modeLoginBtn.addEventListener('click', () => setMode('login'));
  modeSignupBtn.addEventListener('click', () => setMode('signup'));

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitSpinner.style.display = isLoading ? 'inline-block' : 'none';
  }

  function mapErrorMessage(err) {
    if (!err || !err.code) return 'Something went wrong. Please try again.';
    switch (err.code) {
      case 'auth/invalid-email':
        return 'That email address is not valid.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/email-already-in-use':
        return 'This email is already in use. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return err.message || 'Authentication failed. Please try again.';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      errorBox.textContent = 'Email and password are required.';
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      // onAuthStateChanged will handle redirect
    } catch (err) {
      console.error(err);
      errorBox.textContent = mapErrorMessage(err);
    } finally {
      setLoading(false);
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = REDIRECT_URL;
    }
  });
</script>
</body>
</html>
