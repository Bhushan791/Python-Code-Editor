from flask import Flask, render_template, request, jsonify
import subprocess
import sys
import os
import tempfile
import threading
import signal
from pathlib import Path

app = Flask(__name__)

# Configuration constants
CODE_EXECUTION_TIMEOUT = 10  # seconds - increased for complex operations
MAX_OUTPUT_LENGTH = 10000    # maximum length of output
MAX_CODE_LENGTH = 50000      # maximum code length to prevent abuse

# Security: Block dangerous modules and keywords
BLOCKED_MODULES = {
    'os', 'sys', 'shutil', 'subprocess', 'socket', 'threading', 
    'multiprocessing', 'importlib', 'ctypes', 'pickle', 'marshal',
    'tempfile', 'glob', 'pathlib', 'urllib', 'requests', 'http'
}

BLOCKED_KEYWORDS = {
    'eval', 'exec', 'compile', 'open', '__import__', 'getattr', 
    'setattr', 'delattr', 'hasattr', 'vars', 'dir', 'globals', 
    'locals', 'exit', 'quit'
}

def is_safe_code(code: str) -> tuple:
    """
    Enhanced security check for code safety.
    Returns (is_safe: bool, error_message: str)
    """
    if len(code) > MAX_CODE_LENGTH:
        return False, f"Code too long. Maximum allowed: {MAX_CODE_LENGTH} characters."
    
    lowered = code.lower()
    
    # Check for blocked modules
    for module in BLOCKED_MODULES:
        patterns = [
            f'import {module}',
            f'from {module}',
            f'__import__("{module}")',
            f"__import__('{module}')"
        ]
        for pattern in patterns:
            if pattern in lowered:
                return False, f"Blocked module '{module}' detected."
    
    # Check for blocked keywords
    for keyword in BLOCKED_KEYWORDS:
        if keyword in lowered:
            return False, f"Blocked keyword '{keyword}' detected."
    
    # Check for dangerous file operations
    dangerous_patterns = ['file://', 'ftp://', 'http://', 'https://']
    for pattern in dangerous_patterns:
        if pattern in lowered:
            return False, "Network operations are not allowed."
    
    return True, ""

def run_python_code(code: str, input_data: str = ""):
    """
    Executes Python code safely with proper input handling.
    Returns (success: bool, output: str)
    """
    # Security check
    is_safe, error_msg = is_safe_code(code)
    if not is_safe:
        return False, f"Security Error: {error_msg}"
    
    # Create a temporary file with proper cleanup
    temp_file = None
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            temp_file = f.name
            f.write(code)
        
        # Prepare input data - ensure proper formatting
        if input_data:
            # Split input by lines and ensure each line ends with newline
            input_lines = input_data.strip().split('\n')
            input_data = '\n'.join(input_lines) + '\n'
        else:
            input_data = '\n'  # Provide at least one newline for input()
        
        # Run the code with proper input handling
        process = subprocess.Popen(
            [sys.executable, '-u', temp_file],  # -u for unbuffered output
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            universal_newlines=True,
            bufsize=0  # Unbuffered for better input/output handling
        )
        
        try:
            # Communicate with timeout and input
            stdout, stderr = process.communicate(input=input_data, timeout=CODE_EXECUTION_TIMEOUT)
            
            # Combine output
            output = ""
            if stdout:
                output += stdout
            if stderr and process.returncode != 0:
                # Only include stderr if there was an actual error
                if output and not output.endswith('\n'):
                    output += "\n"
                output += stderr
            
            # Clean up output
            output = output.strip()
            
            # Truncate if too long
            if len(output) > MAX_OUTPUT_LENGTH:
                output = output[:MAX_OUTPUT_LENGTH] + "\n...Output truncated."
            
            # Success if process exited cleanly
            success = process.returncode == 0
            return success, output if output else "(No output)"
            
        except subprocess.TimeoutExpired:
            process.kill()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.terminate()
            return False, "Error: Code execution timed out."
            
    except Exception as e:
        return False, f"Execution Error: {str(e)}"
    
    finally:
        # Clean up temporary file
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except:
                pass  # Ignore cleanup errors

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/run', methods=['POST'])
def run():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'output': 'No data received.'})
        
        code = data.get('code', '').strip()
        input_data = data.get('input', '')
        
        if not code:
            return jsonify({'success': False, 'output': 'No code provided.'})
        
        success, output = run_python_code(code, input_data)
        return jsonify({'success': success, 'output': output})
        
    except Exception as e:
        return jsonify({'success': False, 'output': f'Server Error: {str(e)}'})

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)