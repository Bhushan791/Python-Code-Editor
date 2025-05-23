import subprocess
import sys
import os
import tempfile
import time
import re
from pathlib import Path

# Configuration constants
CODE_EXECUTION_TIMEOUT = 15  # seconds - reasonable timeout
MAX_OUTPUT_LENGTH = 15000    # maximum output length to prevent flooding
MAX_CODE_LENGTH = 100000     # maximum code length (100KB)

# Security: Block dangerous modules and keywords to prevent malicious code execution
BLOCKED_MODULES = {
    'os', 'sys', 'shutil', 'subprocess', 'socket', 'threading', 
    'multiprocessing', 'importlib', 'ctypes', 'pickle', 'marshal',
    'tempfile', 'glob', 'pathlib', 'urllib', 'requests', 'http',
    'webbrowser', 'tkinter', 'turtle', 'pygame', 'win32api',
    'pywintypes', 'winreg', 'msilib', 'msvcrt'
}

BLOCKED_KEYWORDS = {
    'eval', 'exec', 'compile', '__import__', 'getattr', 
    'setattr', 'delattr', 'hasattr', 'vars', 'dir', 'globals', 
    'locals', 'exit', 'quit', 'breakpoint', 'help', 'copyright',
    'credits', 'license', 'open'
}

# Dangerous patterns that should be blocked
DANGEROUS_PATTERNS = [
    r'while\s+true\s*:',           # Infinite loops
    r'while\s+1\s*:',              # Infinite loops
    r'for\s+\w+\s+in\s+iter\s*\(', # Potential infinite iterators
    r'__[a-zA-Z_][a-zA-Z0-9_]*__', # Dunder methods (potentially dangerous)
    r'lambda.*:.*exec',            # Lambda with exec
    r'lambda.*:.*eval',            # Lambda with eval
    r'file://',                    # File URLs
    r'ftp://',                     # FTP URLs
    r'http[s]?://',               # HTTP URLs
]

def is_safe_code(code: str) -> tuple:
    """
    Enhanced security check for code safety.
    Returns (is_safe: bool, error_message: str)
    """
    if not code or not code.strip():
        return False, "Empty code provided."
    
    if len(code) > MAX_CODE_LENGTH:
        return False, f"Code too long. Maximum allowed: {MAX_CODE_LENGTH} characters."
    
    # Convert to lowercase for case-insensitive checking
    code_lower = code.lower()
    
    # Check for blocked modules
    for module in BLOCKED_MODULES:
        patterns = [
            f'import {module}',
            f'from {module}',
            f'__import__("{module}")',
            f"__import__('{module}')",
            f'__import__({module})'
        ]
        for pattern in patterns:
            if pattern in code_lower:
                return False, f"Blocked module '{module}' is not allowed."
    
    # Check for blocked keywords
    for keyword in BLOCKED_KEYWORDS:
        # Use word boundaries to avoid false positives
        if re.search(rf'\b{re.escape(keyword)}\b', code_lower):
            return False, f"Blocked keyword '{keyword}' is not allowed."
    
    # Check for dangerous patterns using regex
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, code_lower, re.IGNORECASE):
            return False, f"Potentially dangerous code pattern detected."
    
    # Check for suspicious file operations
    file_operations = ['open(', 'file(', 'with open']
    for op in file_operations:
        if op in code_lower:
            return False, "File operations are not allowed for security reasons."
    
    # Check for network-related operations
    network_patterns = ['socket', 'urllib', 'requests', 'http', 'ftp']
    for pattern in network_patterns:
        if pattern in code_lower:
            return False, "Network operations are not allowed."
    
    return True, ""

def extract_input_prompts(code: str) -> list:
    """
    Extract input prompts from the code to help users understand what input is needed.
    Returns a list of prompt strings found in input() calls.
    """
    prompts = []
    # Match input() calls with string prompts
    pattern = r'input\s*\(\s*(["\'])(.*?)\1\s*\)'
    matches = re.findall(pattern, code, re.IGNORECASE)
    
    for match in matches:
        prompt_text = match[1].strip()
        if prompt_text:
            prompts.append(prompt_text)
    
    return prompts

def prepare_input_data(input_data: str, code: str) -> str:
    """
    Prepare input data for subprocess execution.
    Ensures proper formatting with newlines for multiple input() calls.
    """
    if not input_data:
        return ""
    
    # Split input by newlines and clean up
    input_lines = [line.strip() for line in input_data.strip().split('\n') if line.strip()]
    
    # Count expected input() calls
    input_count = len(re.findall(r'input\s*\(', code, re.IGNORECASE))
    
    # If we have fewer inputs than expected, warn but proceed
    if len(input_lines) < input_count:
        # Pad with empty strings
        input_lines.extend([''] * (input_count - len(input_lines)))
    
    # Join with newlines and add final newline
    return '\n'.join(input_lines) + '\n'

def run_python_code(code: str, input_data: str = ""):
    """
    Executes Python code safely with proper input handling and security measures.
    
    Args:
        code (str): Python code to execute
        input_data (str): Input data for input() calls, separated by newlines
    
    Returns:
        tuple: (success: bool, output: str)
    """
    start_time = time.time()
    
    # Security validation
    is_safe, error_msg = is_safe_code(code)
    if not is_safe:
        return False, f"Security Error: {error_msg}"
    
    temp_file = None
    try:
        # Create temporary file for code execution
        with tempfile.NamedTemporaryFile(
            mode='w', 
            suffix='.py', 
            delete=False, 
            encoding='utf-8',
            prefix='python_executor_'
        ) as f:
            temp_file = f.name
            
            # Write the code with some safety additions
            safe_wrapper = f'''#!/usr/bin/env python3
# Auto-generated safe execution wrapper
import sys
import signal

def timeout_handler(signum, frame):
    print("\\nExecution timed out!")
    sys.exit(1)

# Set up timeout for Unix systems
try:
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm({CODE_EXECUTION_TIMEOUT})
except (AttributeError, OSError):
    # Windows doesn't support SIGALRM
    pass

# User code starts here:
try:
{code}
except KeyboardInterrupt:
    print("\\nExecution interrupted by user.")
    sys.exit(1)
except SystemExit:
    pass
except Exception as e:
    print(f"Runtime Error: {{type(e).__name__}}: {{e}}")
    sys.exit(1)
'''
            f.write(safe_wrapper)
        
        # Prepare input data
        prepared_input = prepare_input_data(input_data, code)
        
        # Execute the code using subprocess
        result = subprocess.run(
            [sys.executable, '-u', temp_file],  # -u for unbuffered output
            input=prepared_input,
            capture_output=True,
            text=True,
            timeout=CODE_EXECUTION_TIMEOUT + 2,  # Slightly longer than internal timeout
            cwd=os.path.dirname(temp_file),  # Run in temp directory
            env=get_safe_environment()
        )
        
        # Process the output
        output = ""
        
        # Add stdout
        if result.stdout:
            output += result.stdout
        
        # Add stderr only if there was an error
        if result.stderr and result.returncode != 0:
            stderr_clean = result.stderr.strip()
            if stderr_clean and "timeout_handler" not in stderr_clean:
                if output and not output.endswith('\n'):
                    output += '\n'
                output += f"Error: {stderr_clean}"
        
        # Clean up the output
        output = output.strip()
        
        # Truncate if too long
        if len(output) > MAX_OUTPUT_LENGTH:
            output = output[:MAX_OUTPUT_LENGTH] + "\n\n... Output truncated (too long)"
        
        # Calculate execution time
        execution_time = time.time() - start_time
        
        # Determine success
        success = result.returncode == 0
        
        # Add execution info for debugging (optional)
        if success and output:
            output += f"\n\n[Executed in {execution_time:.2f}s]"
        
        return success, output if output else "(No output produced)"
        
    except subprocess.TimeoutExpired:
        return False, "Error: Code execution timed out. Your code may have an infinite loop or is taking too long to execute."
    
    except subprocess.CalledProcessError as e:
        return False, f"Execution Error: Process failed with return code {e.returncode}"
    
    except FileNotFoundError:
        return False, "Error: Python interpreter not found. Please ensure Python is installed and in PATH."
    
    except MemoryError:
        return False, "Error: Out of memory. Your code may be using too much memory."
    
    except Exception as e:
        return False, f"Unexpected Error: {type(e).__name__}: {str(e)}"
    
    finally:
        # Clean up temporary file
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except OSError:
                pass  # Ignore cleanup errors

def get_safe_environment():
    """
    Create a safer environment for code execution.
    Returns a modified environment dictionary.
    """
    env = os.environ.copy()
    
    # Clear potentially dangerous environment variables
    dangerous_vars = [
        'PYTHONPATH', 'PYTHONHOME', 'PYTHONSTARTUP', 
        'PYTHONOPTIMIZE', 'PYTHONDONTWRITEBYTECODE'
    ]
    
    for var in dangerous_vars:
        env.pop(var, None)
    
    # Set safe Python options
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUNBUFFERED'] = '1'
    
    return env

def validate_input_format(input_data: str, code: str) -> tuple:
    """
    Validate that the input format matches the expected number of input() calls.
    Returns (is_valid: bool, message: str)
    """
    if not input_data:
        input_count = len(re.findall(r'input\s*\(', code, re.IGNORECASE))
        if input_count > 0:
            return False, f"Code requires {input_count} input(s), but no input provided."
        return True, ""
    
    input_lines = [line for line in input_data.strip().split('\n') if line.strip()]
    input_count = len(re.findall(r'input\s*\(', code, re.IGNORECASE))
    
    if len(input_lines) < input_count:
        return False, f"Code requires {input_count} input(s), but only {len(input_lines)} provided."
    
    return True, ""

# Test functions for debugging and validation
def test_basic_functionality():
    """Test basic code execution functionality."""
    print("Testing basic functionality...")
    
    test_cases = [
        # Basic output
        ("print('Hello, World!')", "", True),
        
        # Simple math
        ("result = 5 + 3\nprint(f'Result: {result}')", "", True),
        
        # Input handling
        ("name = input('Enter your name: ')\nprint(f'Hello, {name}!')", "Alice", True),
        
        # Multiple inputs
        ("age = int(input('Age: '))\nname = input('Name: ')\nprint(f'{name} is {age} years old')", "25\nBob", True),
        
        # Error case
        ("print(1/0)", "", False),
        
        # Security test (should fail)
        ("import os\nos.system('ls')", "", False),
    ]
    
    for i, (code, inp, should_succeed) in enumerate(test_cases, 1):
        print(f"\nTest {i}: {code[:30]}...")
        success, output = run_python_code(code, inp)
        
        status = "✓" if success == should_succeed else "✗"
        print(f"  {status} Success: {success}")
        print(f"  Output: {output[:100]}...")
        
        if success != should_succeed:
            print(f"  ERROR: Expected success={should_succeed}, got {success}")

def get_code_statistics(code: str) -> dict:
    """
    Get statistics about the code for debugging purposes.
    """
    return {
        'lines': len(code.split('\n')),
        'characters': len(code),
        'input_calls': len(re.findall(r'input\s*\(', code, re.IGNORECASE)),
        'print_calls': len(re.findall(r'print\s*\(', code, re.IGNORECASE)),
        'input_prompts': extract_input_prompts(code)
    }

if __name__ == "__main__":
    # Run tests when script is executed directly
    print("Python Code Executor - Test Mode")
    print("=" * 50)
    test_basic_functionality()
    
    print("\n" + "=" * 50)
    print("Interactive test:")
    
    # Interactive test
    test_code = '''
print("Hello, World!")
age = int(input("Enter your age: "))
if age >= 18:
    print("You are an adult")
else:
    print("You are not an adult")
'''
    
    print("Code to execute:")
    print(test_code)
    
    stats = get_code_statistics(test_code)
    print(f"\nCode statistics: {stats}")
    
    test_input = "25"
    print(f"Input: {test_input}")
    
    success, output = run_python_code(test_code, test_input)
    print(f"\nSuccess: {success}")
    print(f"Output:\n{output}")