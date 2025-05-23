/**
 * editor.js
 * 
 * Enhanced Monaco Editor initialization script for an online Python editor.
 * Features:
 * - Save/restore content with localStorage
 * - Keyboard shortcuts: Ctrl+Enter (run), Ctrl+S (download)
 * - Live status bar with current line/column
 * - Improved theme toggle button with accessible text/icons
 * - Monaco features: font ligatures, hover tooltips, whitespace rendering, smooth cursor blinking
 * - Clean, production-ready, accessible, and responsive
 */

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' } });

(() => {
  'use strict';

  // Constants
  const STORAGE_KEY = 'monaco-python-editor-content';
  const DEFAULT_THEME = 'vs-dark';
  const LIGHT_THEME = 'vs-light';

  // DOM Elements
  const editorContainer = document.getElementById('editor-container');
  const outputContainer = document.getElementById('output-container');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const statusBar = document.getElementById('status-bar');

  // State
  let editor;
  let currentTheme = DEFAULT_THEME;

  /**
   * Apply page styles based on the theme for accessibility and UX consistency.
   * @param {string} theme 
   */
  function applyPageStyles(theme) {
    if (theme === LIGHT_THEME) {
      document.body.style.backgroundColor = '#ffffff';
      document.body.style.color = '#000000';
      outputContainer.style.color = '#333333';
      themeToggleBtn.textContent = '🌙 Dark Mode';
      themeToggleBtn.setAttribute('aria-label', 'Switch to dark theme');
    } else {
      document.body.style.backgroundColor = '#1e1e1e';
      document.body.style.color = '#dddddd';
      outputContainer.style.color = '#d4d4d4';
      themeToggleBtn.textContent = '☀️ Light Mode';
      themeToggleBtn.setAttribute('aria-label', 'Switch to light theme');
    }
  }

  /**
   * Toggle between dark and light themes.
   */
  function switchTheme() {
    currentTheme = currentTheme === DEFAULT_THEME ? LIGHT_THEME : DEFAULT_THEME;
    monaco.editor.setTheme(currentTheme);
    applyPageStyles(currentTheme);
  }

  /**
   * Save editor content to localStorage.
   */
  function saveContent() {
    if (!editor) return;
    try {
      localStorage.setItem(STORAGE_KEY, editor.getValue());
      showStatusMessage('Content saved locally.');
    } catch (e) {
      console.error('Failed to save content:', e);
      showStatusMessage('Failed to save content.', true);
    }
  }

  /**
   * Restore editor content from localStorage.
   * @returns {string|null} The restored content or null if none found.
   */
  function restoreContent() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to restore content:', e);
      return null;
    }
  }

  /**
   * Download the current editor content as a .py file.
   */
  function downloadContent() {
    if (!editor) return;
    const content = editor.getValue();
    const blob = new Blob([content], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code.py';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatusMessage('Downloaded code.py');
  }

  /**
   * Show a temporary message in the output container.
   * @param {string} message 
   * @param {boolean} isError 
   */
  function showStatusMessage(message, isError = false) {
    outputContainer.textContent = message;
    outputContainer.style.color = isError ? '#ff5555' : (currentTheme === LIGHT_THEME ? '#333' : '#d4d4d4');
    clearTimeout(showStatusMessage.timeout);
    showStatusMessage.timeout = setTimeout(() => {
      outputContainer.textContent = '';
    }, 3000);
  }

  /**
   * Update the status bar with current line and column.
   */
  function updateStatusBar() {
    if (!editor || !statusBar) return;
    const position = editor.getPosition();
    statusBar.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  }

  /**
   * Initialize Monaco Editor with enhanced options.
   */
  function initializeEditor() {
    const savedContent = restoreContent();
    editor = monaco.editor.create(editorContainer, {
      value: savedContent || `# Write your Python code here\nprint("Hello, World!")\n`,
      language: 'python',
      theme: currentTheme,
      automaticLayout: true,
      fontSize: 16,
      minimap: { enabled: false },
      wordWrap: 'on',
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      tabSize: 4,
      formatOnType: true,
      formatOnPaste: true,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      cursorBlinking: 'smooth',
      fontLigatures: true,
      renderWhitespace: 'all',
      renderLineHighlight: 'all',
      smoothScrolling: true,
      cursorSmoothCaretAnimation: true,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      accessibilitySupport: 'on',
      overviewRulerLanes: 3,
      hover: {
        enabled: true,
        delay: 300,
        sticky: true,
      }
    });

    // Update status bar on cursor move
    editor.onDidChangeCursorPosition(updateStatusBar);
    updateStatusBar();

    // Save content on change (debounced)
    let saveTimeout;
    editor.onDidChangeModelContent(() => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveContent, 1000);
    });

    // Keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      // Placeholder for running code
      showStatusMessage('Running code...');
      // You can integrate your code execution logic here
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, () => {
      downloadContent();
    });
  }

  /**
   * Initialize theme toggle button accessibility and event.
   */
  function initializeThemeToggle() {
    themeToggleBtn.setAttribute('role', 'button');
    themeToggleBtn.setAttribute('tabindex', '0');
    themeToggleBtn.setAttribute('aria-pressed', currentTheme === DEFAULT_THEME ? 'false' : 'true');
    themeToggleBtn.addEventListener('click', () => {
      switchTheme();
      themeToggleBtn.setAttribute('aria-pressed', currentTheme === DEFAULT_THEME ? 'false' : 'true');
    });
    themeToggleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchTheme();
        themeToggleBtn.setAttribute('aria-pressed', currentTheme === DEFAULT_THEME ? 'false' : 'true');
      }
    });
  }

  /**
   * Initialize the entire editor environment.
   */
  function init() {
    applyPageStyles(currentTheme);
    initializeThemeToggle();
    require(['vs/editor/editor.main'], () => {
      initializeEditor();
    });
  }

  // Initialize on DOMContentLoaded for responsiveness and accessibility
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
