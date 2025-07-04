🐍 Python Code Editor
A secure, web-based Python editor with real-time code execution 🚀. Built with Flask, it offers a safe environment for running Python scripts with input support and strong security 🔒.

✨ Features
⚡ Instant Python code execution

📝 User input support

🚫 Blocks dangerous modules & keywords for security

⏳ Execution timeout (10 seconds) and output limits

🎨 Simple and clean web interface

🔐 Security Highlights
🚫 Blocked modules: os, sys, subprocess, socket, threading, importlib, pickle, etc.

🚫 Blocked keywords: eval, exec, open, __import__, exit, etc.

❌ No file I/O or network requests allowed

📏 Max code length: 50,000 chars; max output length: 10,000 chars

🛠️ Installation
bash
Copy
Edit
git clone <repo-url>  
cd python-code-editor  
python -m venv venv  
source venv/bin/activate  # Windows: venv\Scripts\activate  
pip install flask  
mkdir templates  
# Add templates/index.html with your HTML UI  
python app.py  
🌐 Usage
Open http://127.0.0.1:5000 in your browser, write Python code 🐍, provide input if needed ✍️, and run ▶️ to see live output 🖥️.

🔗 API Endpoints
GET / — Editor interface 🖥️

POST /run — Execute code (send JSON with code and optional input) 🔄

GET /health — Health check ✅

⚙️ Configurable in app.py
⏲️ CODE_EXECUTION_TIMEOUT (default 10s)

📏 MAX_OUTPUT_LENGTH (default 10,000 chars)

📝 MAX_CODE_LENGTH (default 50,000 chars)

🏗️ Architecture
✔️ Validates code against security rules

🔒 Runs code in isolated subprocess with timeout

🖥️ Manages input/output safely

🧹 Cleans up temporary files

⚠️ Limitations
🚫 No file or network operations

🕒 Limited execution time

🗃️ No persistent storage

🤝 Contributing
Fork 🔀, create a feature branch 🌿, commit ✔️, and submit a pull request 🔃.

📄 License
Open source — add your preferred license 📝.

📝 Notes
Designed for educational use 🎓 with strong security 🔐 — always review code carefully before execution 🛡️.
