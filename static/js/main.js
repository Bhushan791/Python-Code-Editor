document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('run-btn');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('copy-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const outputContainer = document.getElementById('output-container');

    // Enhanced input detection patterns
    const INPUT_PATTERNS = [
        /input\s*\(/gi,
        /raw_input\s*\(/gi,
        /sys\.stdin\.read/gi,
        /sys\.stdin\.readline/gi
    ];

    /**
     * Detect if code contains input operations
     * @param {string} code - Python code to analyze
     * @returns {boolean} True if input operations detected
     */
    function detectsInput(code) {
        // Remove comments and strings to avoid false positives
        const cleanCode = code
            .replace(/"""[\s\S]*?"""/g, '') // Remove triple-quoted strings
            .replace(/'''[\s\S]*?'''/g, '') // Remove triple-quoted strings
            .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '') // Remove double-quoted strings
            .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, '') // Remove single-quoted strings
            .replace(/#.*$/gm, ''); // Remove comments

        return INPUT_PATTERNS.some(pattern => pattern.test(cleanCode));
    }

    /**
     * Enhanced input prompt with better UX
     * @param {string} code - The code being executed
     * @returns {string|null} User input or null if cancelled
     */
    function promptUserInput(code) {
        // Count number of input calls to help user
        const inputCount = (code.match(/input\s*\(/gi) || []).length;
        
        let message = "Your code requires input.\n\n";
        if (inputCount > 1) {
            message += `Detected ${inputCount} input() calls.\n`;
            message += "Enter each input value on a separate line:\n\n";
        } else {
            message += "Enter the input value:\n\n";
        }
        
        // Extract input prompts from code to show user what's expected
        const inputMatches = code.match(/input\s*\(\s*["']([^"']*)["']\s*\)/gi);
        if (inputMatches && inputMatches.length > 0) {
            message += "Expected inputs:\n";
            inputMatches.forEach((match, index) => {
                const promptText = match.match(/["']([^"']*)["']/);
                if (promptText && promptText[1]) {
                    message += `${index + 1}. ${promptText[1]}\n`;
                }
            });
            message += "\n";
        }
        
        const userInput = prompt(message, "");
        return userInput;
    }

    /**
     * Show loading state with animation
     */
    function showLoading() {
        outputContainer.innerHTML = '<div class="loading">Running<span class="dots">...</span></div>';
        outputContainer.classList.remove('error');
        
        // Animate dots
        let dotCount = 0;
        const loadingInterval = setInterval(() => {
            const dotsElement = outputContainer.querySelector('.dots');
            if (dotsElement) {
                dotCount = (dotCount + 1) % 4;
                dotsElement.textContent = '.'.repeat(dotCount);
            } else {
                clearInterval(loadingInterval);
            }
        }, 500);
        
        return loadingInterval;
    }

    /**
     * Execute code with enhanced error handling and user feedback
     * @param {string} code - Python code to execute
     * @param {string} inputData - Input data for the code
     */
    async function executeCode(code, inputData = "") {
        const loadingInterval = showLoading();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch('/run', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ code, input: inputData }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            clearInterval(loadingInterval);

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            displayResult(result);

        } catch (err) {
            clearInterval(loadingInterval);
            
            if (err.name === 'AbortError') {
                displayError('Request timed out. The code may be taking too long to execute.');
            } else if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
                displayError('Network error. Please check your connection and try again.');
            } else {
                displayError('Error: ' + err.message);
            }
        }
    }

    /**
     * Display execution result
     * @param {Object} result - Execution result from server
     */
    function displayResult(result) {
        if (result.success) {
            outputContainer.textContent = result.output || '(No output)';
            outputContainer.classList.remove('error');
            outputContainer.classList.add('success');
        } else {
            displayError(result.output || 'Unknown error occurred');
        }
    }

    /**
     * Display error message
     * @param {string} message - Error message to display
     */
    function displayError(message) {
        outputContainer.textContent = message;
        outputContainer.classList.remove('success');
        outputContainer.classList.add('error');
    }

    /**
     * Main function to handle code execution
     */
    async function runCode() {
        if (!window.editor) {
            displayError('Editor not initialized. Please refresh the page.');
            return;
        }

        const code = editor.getModel().getValue().trim();
        
        if (!code) {
            displayError('No code to execute. Please write some Python code first.');
            return;
        }

        // Check if code requires input
        if (detectsInput(code)) {
            const userInput = promptUserInput(code);
            if (userInput === null) {
                outputContainer.textContent = 'Execution cancelled by user.';
                outputContainer.classList.remove('error', 'success');
                return;
            }
            await executeCode(code, userInput);
        } else {
            await executeCode(code);
        }
    }

    /**
     * Download current code as a .py file
     */
    function downloadCode() {
        if (!window.editor) {
            alert('Editor not initialized.');
            return;
        }

        const code = editor.getModel().getValue();
        if (!code.trim()) {
            alert('No code to download.');
            return;
        }

        try {
            const blob = new Blob([code], { type: 'text/x-python' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `python_script_${new Date().toISOString().slice(0,10)}.py`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Failed to download code: ' + err.message);
        }
    }

    /**
     * Copy current code to clipboard
     */
    async function copyCode() {
        if (!window.editor) {
            alert('Editor not initialized.');
            return;
        }

        try {
            const code = editor.getModel().getValue();
            if (!code.trim()) {
                alert('No code to copy.');
                return;
            }

            await navigator.clipboard.writeText(code);
            
            // Show temporary success message
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.style.background = '#28a745';
            
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '';
            }, 2000);
            
        } catch (err) {
            // Fallback for older browsers
            try {
                const textArea = document.createElement('textarea');
                textArea.value = editor.getModel().getValue();
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                alert('Code copied to clipboard!');
            } catch (fallbackErr) {
                alert('Failed to copy code: ' + err.message);
            }
        }
    }

    /**
     * Enhanced keyboard shortcuts
     */
    window.addEventListener('keydown', (e) => {
        // Ctrl+Enter or Cmd+Enter to run code
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runCode();
        }
        
        // Ctrl+S or Cmd+S to download code
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            downloadCode();
        }
        
        // Ctrl+D or Cmd+D to copy code
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            copyCode();
        }
        
        // Escape to clear output
        if (e.key === 'Escape') {
            outputContainer.textContent = '';
            outputContainer.classList.remove('error', 'success');
        }
    });

    // Event listeners for buttons
    if (runBtn) runBtn.addEventListener('click', runCode);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadCode);
    if (copyBtn) copyBtn.addEventListener('click', copyCode);
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (typeof switchTheme === 'function') {
                switchTheme();
            } else {
                console.warn('switchTheme function is not defined.');
            }
        });
    }

    // Initialize with welcome message
    if (outputContainer) {
        outputContainer.innerHTML = `
            <div style="color: #666; font-style: italic;">
                Ready to run Python code!<br>
                • Press Ctrl+Enter to run<br>
                • Press Ctrl+S to download<br>
                • Press Ctrl+D to copy<br>
                • Press Escape to clear output
            </div>
        `;
    }
});

// Add CSS for loading animation and better styling
const style = document.createElement('style');
style.textContent = `
    .loading {
        color: #007acc;
        font-weight: bold;
    }
    
    .success {
        background-color: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
    }
    
    .error {
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        color: #721c24;
    }
    
    #output-container {
        transition: all 0.3s ease;
        border-radius: 4px;
        padding: 10px;
        margin-top: 10px;
    }
`;
document.head.appendChild(style);