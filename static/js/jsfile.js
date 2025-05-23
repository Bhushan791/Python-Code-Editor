require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' } });

let editor;
let currentTheme = 'vs-dark';
const outputContainer = document.getElementById('output-container');

// Terminal input state
let isWaitingForInput = false;
let inputCallback = null;
let inputHistory = [];
let currentInputIndex = -1;

function switchTheme() {
    if (currentTheme === 'vs-dark') {
        currentTheme = 'vs-light';
        document.getElementById('theme-toggle').textContent = '🌙 Theme';
        document.body.style.backgroundColor = '#fff';
        document.body.style.color = '#000';
        outputContainer.style.color = '#333';
    } else {
        currentTheme = 'vs-dark';
        document.getElementById('theme-toggle').textContent = '☀️ Theme';
        document.body.style.backgroundColor = '#1e1e1e';
        document.body.style.color = '#ddd';
        outputContainer.style.color = '#d4d4d4';
    }
    monaco.editor.setTheme(currentTheme);
}

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: `# Write your Python code here\nprint("Hello, World!")\n`,
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
        scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
        }
    });
});

// Terminal-style input functions
function createInputElement() {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'terminal-input-container';

    const prompt = document.createElement('span');
    prompt.textContent = '>>> ';
    prompt.className = 'terminal-prompt';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-input';

    inputContainer.appendChild(prompt);
    inputContainer.appendChild(input);

    return { container: inputContainer, input: input };
}

function showTerminalInput(promptText = '') {
    return new Promise((resolve) => {
        if (isWaitingForInput) {
            resolve('');
            return;
        }

        isWaitingForInput = true;
        inputCallback = resolve;

        if (promptText) {
            const promptDiv = document.createElement('div');
            promptDiv.textContent = promptText;
            promptDiv.className = 'terminal-prompt-text';
            outputContainer.appendChild(promptDiv);
        }

        const { container, input } = createInputElement();
        outputContainer.appendChild(container);

        input.focus();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = input.value;

                const inputDisplay = document.createElement('div');
                inputDisplay.className = 'terminal-input-display';
                inputDisplay.textContent = `>>> ${value}`;

                container.replaceWith(inputDisplay);

                if (value.trim()) {
                    inputHistory.push(value);
                    currentInputIndex = inputHistory.length;
                }

                isWaitingForInput = false;
                const callback = inputCallback;
                inputCallback = null;
                callback(value);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentInputIndex > 0) {
                    currentInputIndex--;
                    input.value = inputHistory[currentInputIndex] || '';
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentInputIndex < inputHistory.length - 1) {
                    currentInputIndex++;
                    input.value = inputHistory[currentInputIndex] || '';
                } else {
                    currentInputIndex = inputHistory.length;
                    input.value = '';
                }
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                container.remove();
                isWaitingForInput = false;
                const callback = inputCallback;
                inputCallback = null;
                callback(null);
            }
        });
    });
}

async function collectAllInputs(code) {
    const inputs = [];
    const inputMatches = code.match(/input\s*\(\s*["']([^"']*)["']\s*\)/gi) || [];
    const inputCount = (code.match(/input\s*\(/gi) || []).length;

    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'terminal-instruction';
    instructionDiv.innerHTML = `
        Code requires ${inputCount} input(s). Enter each value when prompted.<br>
        Press Enter to submit, Escape to cancel, ↑↓ for history.
    `;
    outputContainer.appendChild(instructionDiv);

    for (let i = 0; i < inputCount; i++) {
        let promptText = '';
        if (inputMatches[i]) {
            const match = inputMatches[i].match(/["']([^"']*)["']/);
            if (match && match[1]) {
                promptText = match[1];
            }
        }
        if (!promptText) {
            promptText = `Input ${i + 1}:`;
        }

        const userInput = await showTerminalInput(promptText);

        if (userInput === null) {
            const cancelDiv = document.createElement('div');
            cancelDiv.className = 'terminal-cancel';
            cancelDiv.textContent = 'Execution cancelled by user.';
            outputContainer.appendChild(cancelDiv);
            return null;
        }

        inputs.push(userInput);
    }

    return inputs.join('\n');
}

async function executeCode(code, inputData = "") {
    outputContainer.innerHTML = '<div class="terminal-running">Running...</div>';
    outputContainer.classList.remove('error');

    try {
        const response = await fetch('/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, input: inputData })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        outputContainer.innerHTML = '';

        if (result.success) {
            const outputDiv = document.createElement('div');
            outputDiv.className = 'terminal-output';
            outputDiv.textContent = result.output || '(No output)';
            outputContainer.appendChild(outputDiv);
            outputContainer.classList.remove('error');
        } else {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'terminal-error';
            errorDiv.textContent = result.output || 'Error occurred';
            outputContainer.appendChild(errorDiv);
            outputContainer.classList.add('error');
        }
    } catch (err) {
        outputContainer.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'terminal-error';
        errorDiv.textContent = 'Error: ' + err.message;
        outputContainer.appendChild(errorDiv);
        outputContainer.classList.add('error');
    }
}

async function runCode() {
    if (!editor) {
        outputContainer.textContent = 'Editor not initialized. Please refresh the page.';
        return;
    }

    const code = editor.getModel().getValue();
    outputContainer.innerHTML = '';

    if (code.includes('input(')) {
        try {
            const userInput = await collectAllInputs(code);
            if (userInput === null) {
                return;
            }
            await executeCode(code, userInput);
        } catch (error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'terminal-error';
            errorDiv.textContent = 'Input collection error: ' + error.message;
            outputContainer.appendChild(errorDiv);
        }
    } else {
        await executeCode(code);
    }
}

function downloadCode() {
    const code = editor.getModel().getValue();
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'script.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function copyCode() {
    try {
        await navigator.clipboard.writeText(editor.getModel().getValue());
        alert('Code copied to clipboard!');
    } catch (err) {
        alert('Failed to copy code: ' + err.message);
    }
}

// Prevent global key events when input is focused
document.addEventListener('keydown', (e) => {
    if (isWaitingForInput) {
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadCode();
    }
});

document.getElementById('run-btn').addEventListener('click', runCode);
document.getElementById('download-btn').addEventListener('click', downloadCode);
document.getElementById('copy-btn').addEventListener('click', copyCode);
document.getElementById('theme-toggle').addEventListener('click', switchTheme);

outputContainer.innerHTML = `
    <div class="terminal-welcome">
        Welcome to Python Code Editor!<br>
        • Write your code in the editor above<br>
        • Press "Run Code" or Ctrl+Enter to execute<br>
        • Input prompts will appear here in terminal style<br>
    </div>
`;
