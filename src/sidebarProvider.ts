import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { getActiveFileContext } from './extension';

// ─── Tool Execution ────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders ? folders[0].uri.fsPath : null;
}

function resolvePath(filepath: string): string {
    const root = getWorkspaceRoot();
    if (path.isAbsolute(filepath)) return filepath;
    return root ? path.join(root, filepath) : filepath;
}

function toolListDir(dirPath: string): string {
    const resolved = resolvePath(dirPath);
    try {
        if (!fs.existsSync(resolved)) return `[ERROR] Directory not found: ${dirPath}`;
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        if (entries.length === 0) return `[LIST_DIR RESULT: ${dirPath}]\n(empty directory)`;
        const lines = entries.map(e => {
            if (e.isDirectory()) return `  📁 ${e.name}/`;
            const stat = fs.statSync(path.join(resolved, e.name));
            const kb = (stat.size / 1024).toFixed(1);
            return `  📄 ${e.name} (${kb} KB)`;
        });
        return `[LIST_DIR RESULT: ${dirPath}]\n${lines.join('\n')}`;
    } catch (err: any) {
        return `[ERROR listing ${dirPath}]: ${err.message}`;
    }
}

function toolReadFile(filepath: string): string {
    const resolved = resolvePath(filepath);
    try {
        if (!fs.existsSync(resolved)) return `[ERROR] File not found: ${filepath}`;
        const stat = fs.statSync(resolved);
        if (stat.size > 500 * 1024) return `[ERROR] File too large to read (${(stat.size/1024).toFixed(0)} KB): ${filepath}`;
        const content = fs.readFileSync(resolved, 'utf8');
        const ext = path.extname(filepath).replace('.', '');
        return `[READ_FILE RESULT: ${filepath}]\n\`\`\`${ext}\n${content}\n\`\`\``;
    } catch (err: any) {
        return `[ERROR reading ${filepath}]: ${err.message}`;
    }
}

function toolWriteFile(filepath: string, content: string): string {
    const resolved = resolvePath(filepath);
    try {
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, content, 'utf8');
        return `[WRITE_FILE RESULT: ${filepath}]\nSuccess — file written.`;
    } catch (err: any) {
        return `[ERROR writing ${filepath}]: ${err.message}`;
    }
}

function toolDeleteFile(filepath: string): string {
    const resolved = resolvePath(filepath);
    try {
        if (!fs.existsSync(resolved)) return `[ERROR] File not found: ${filepath}`;
        fs.unlinkSync(resolved);
        return `[DELETE_FILE RESULT: ${filepath}]\nSuccess — file deleted.`;
    } catch (err: any) {
        return `[ERROR deleting ${filepath}]: ${err.message}`;
    }
}

// ─── Parse & Execute all tools in a response ──────────────────────────────────

interface ToolCall {
    type: 'LIST_DIR' | 'READ_FILE' | 'WRITE_FILE' | 'DELETE_FILE';
    arg: string;
    codeBlock?: string;
    label: string;
}

function extractToolCalls(text: string): ToolCall[] {
    const tools: ToolCall[] = [];

    // LIST_DIR
    const listRe = /\[LIST_DIR:\s*([^\]]+)\]/g;
    let m;
    while ((m = listRe.exec(text)) !== null) {
        tools.push({ type: 'LIST_DIR', arg: m[1].trim(), label: `📂 Listing: ${m[1].trim()}` });
    }

    // READ_FILE
    const readRe = /\[READ_FILE:\s*([^\]]+)\]/g;
    while ((m = readRe.exec(text)) !== null) {
        tools.push({ type: 'READ_FILE', arg: m[1].trim(), label: `📖 Reading: ${m[1].trim()}` });
    }

    // DELETE_FILE
    const deleteRe = /\[DELETE_FILE:\s*([^\]]+)\]/g;
    while ((m = deleteRe.exec(text)) !== null) {
        tools.push({ type: 'DELETE_FILE', arg: m[1].trim(), label: `🗑️ Deleting: ${m[1].trim()}` });
    }

    // WRITE_FILE — must be followed by a code block
    const writeRe = /\[WRITE_FILE:\s*([^\]]+)\]\s*\n```(?:\w*)\n([\s\S]*?)```/g;
    while ((m = writeRe.exec(text)) !== null) {
        tools.push({ type: 'WRITE_FILE', arg: m[1].trim(), codeBlock: m[2], label: `✏️ Writing: ${m[1].trim()}` });
    }

    return tools;
}

function executeTools(tools: ToolCall[]): string {
    return tools.map(tool => {
        switch (tool.type) {
            case 'LIST_DIR':   return toolListDir(tool.arg);
            case 'READ_FILE':  return toolReadFile(tool.arg);
            case 'WRITE_FILE': return toolWriteFile(tool.arg, tool.codeBlock || '');
            case 'DELETE_FILE':return toolDeleteFile(tool.arg);
        }
    }).join('\n\n');
}

function getEnvApiKey(): string {
    const root = getWorkspaceRoot();
    if (!root) return '';
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            const lines = content.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('OPENROUTER_API_KEY=')) {
                    const parts = trimmed.split('=');
                    if (parts.length >= 2) {
                        const val = parts.slice(1).join('=').trim();
                        // Strip single/double quotes if present
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            return val.slice(1, -1);
                        }
                        return val;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to read .env file:', err);
        }
    }
    return '';
}

// ─── SidebarProvider ──────────────────────────────────────────────────────────

export class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _chatHistory: Array<{ role: string; content: string }> = [];
    private _abortController: { aborted: boolean } = { aborted: false };

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.resetHistory();
    }

    private resetHistory() {
        const root = getWorkspaceRoot();
        const rootNote = root ? `The workspace root is: ${root}` : 'No workspace folder is open.';

        this._chatHistory = [
            {
                role: 'system',
                content:
                    'You are KelvCodes AI, an expert software developer and coding assistant embedded directly in VS Code.\n\n' +
                    `Workspace: ${rootNote}\n\n` +

                    '## Your Abilities\n' +
                    'You have direct access to the user\'s workspace file system through tool tags. Use them proactively and autonomously to get the full picture before answering.\n\n' +

                    '## Available Tools\n' +
                    'Emit these tags anywhere in your response and the system will execute them and return results:\n\n' +
                    '`[LIST_DIR: path/to/dir]` — List all files and folders in a directory. Use `.` for root.\n' +
                    '`[READ_FILE: path/to/file.ext]` — Read and return a file\'s contents.\n' +
                    '`[WRITE_FILE: path/to/file.ext]` — Write a file. Must be immediately followed by a fenced code block containing the content.\n' +
                    '`[DELETE_FILE: path/to/file.ext]` — Delete a file.\n\n' +

                    '## How to Think\n' +
                    '- When a user asks about a project, ALWAYS start by using [LIST_DIR: .] to explore the workspace.\n' +
                    '- Then read relevant files with [READ_FILE:] before answering or making edits.\n' +
                    '- Do not ask users to share code — read it yourself.\n' +
                    '- When editing existing files, always read them first, then WRITE_FILE the full updated version.\n' +
                    '- Be proactive. Use as many tools as needed to fully understand the context.\n\n' +

                    '## Active File Context\n' +
                    'The user\'s currently active editor file is automatically appended to their message. Always use it.\n\n' +

                    '## Rules\n' +
                    '- Never output fake XML like <tool_call>. Only use the bracket tag format above.\n' +
                    '- After tool results come back, continue your work immediately without re-explaining what you just did.\n' +
                    '- Be concise. Do not pad responses.'
            }
        ];
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
                case 'sendMessage':      this.handleMessage(data.value); break;
                case 'insertAtCursor':   this.handleInsertAtCursor(data.value); break;
                case 'replaceActiveFile':this.handleReplaceActiveFile(data.value); break;
                case 'stopGeneration':   this._abortController.aborted = true; break;
            }
        });
    }

    public resetChat() {
        this._abortController.aborted = true;
        this.resetHistory();
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear-chat' });
        }
    }

    // ─── File action handlers ─────────────────────────────────────────────────

    private handleInsertAtCursor(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(b => b.insert(editor.selection.active, code));
        } else {
            vscode.window.showInformationMessage('No active editor. Open a file first.');
        }
    }

    private handleReplaceActiveFile(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const doc = editor.document;
            const range = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
            editor.edit(b => b.replace(range, code)).then(ok => {
                if (ok) vscode.window.showInformationMessage('File replaced successfully.');
            });
        } else {
            vscode.window.showInformationMessage('No active editor. Open a file first.');
        }
    }

    // ─── Core: Agentic message loop ──────────────────────────────────────────

    private async handleMessage(text: string) {
        this._abortController = { aborted: false };

        // Append active file context to the user message
        const fileContext = getActiveFileContext();
        let userContent = text;
        if (fileContext) {
            userContent += `\n\n[Active Workspace File: ${fileContext.filename}]\n\`\`\`\n${fileContext.content}\n\`\`\``;
        }

        this._chatHistory.push({ role: 'user', content: userContent });

        // Agentic loop — runs until the AI has no more tool calls
        let iteration = 0;
        const MAX_ITERATIONS = 10;

        while (iteration < MAX_ITERATIONS && !this._abortController.aborted) {
            iteration++;

            // Stream one AI turn and collect the full response
            const fullResponse = await this.streamOneTurn();

            if (!fullResponse || this._abortController.aborted) break;

            // Check if the response contains tool calls
            const toolCalls = extractToolCalls(fullResponse);
            if (toolCalls.length === 0) {
                // No tools — AI is done
                break;
            }

            // Execute tools and report status to UI
            for (const tool of toolCalls) {
                this.postToView({ type: 'tool-status', value: tool.label });
            }

            const toolResults = executeTools(toolCalls);

            // Notify UI that tools are done and AI is continuing
            this.postToView({ type: 'tool-results', value: toolResults });

            // Feed results back to the conversation
            this._chatHistory.push({ role: 'assistant', content: fullResponse });
            this._chatHistory.push({ role: 'user', content: `[TOOL RESULTS]\n${toolResults}\n\nContinue with the task.` });
        }

        this.postToView({ type: 'stream-done' });
    }

    // ─── Single API streaming turn, returns the full collected text ──────────

    private streamOneTurn(): Promise<string> {
        return new Promise((resolve) => {
            const apiKey = getEnvApiKey();
            if (!apiKey) {
                this.postToView({ type: 'stream-error', value: 'OpenRouter API key is missing. Please set OPENROUTER_API_KEY in your .env file in the project root.' });
                vscode.window.showErrorMessage('KelvCodes AI: OPENROUTER_API_KEY not found in .env file.');
                resolve('');
                return;
            }

            const postData = JSON.stringify({
                model: "openrouter/free",
                messages: this._chatHistory,
                stream: true
            });

            const options: https.RequestOptions = {
                hostname: 'openrouter.ai',
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'KelvCodes AI'
                }
            };

            let fullText = '';

            const req = https.request(options, (res) => {
                // Handle HTTP errors
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    let errData = '';
                    res.on('data', (c) => { errData += c.toString(); });
                    res.on('end', () => {
                        let msg = `HTTP ${res.statusCode}`;
                        try {
                            const p = JSON.parse(errData);
                            if (p.error?.message) msg = p.error.message;
                        } catch (_) {}
                        this.postToView({ type: 'stream-error', value: msg });
                        resolve('');
                    });
                    return;
                }

                let buffer = '';

                res.on('data', (chunk) => {
                    if (this._abortController.aborted) {
                        req.destroy();
                        resolve(fullText);
                        return;
                    }

                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const clean = line.trim();
                        if (!clean || !clean.startsWith('data: ')) continue;
                        const data = clean.slice(6).trim();
                        if (data === '[DONE]') { resolve(fullText); return; }
                        try {
                            const parsed = JSON.parse(data);
                            const token = parsed.choices?.[0]?.delta?.content;
                            if (token) {
                                fullText += token;
                                this.postToView({ type: 'stream-token', value: token });
                            }
                        } catch (_) {}
                    }
                });

                res.on('end', () => resolve(fullText));
            });

            req.on('error', (err) => {
                this.postToView({ type: 'stream-error', value: err.message });
                resolve('');
            });

            req.write(postData);
            req.end();
        });
    }

    private postToView(message: object) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    // ─── Webview HTML ─────────────────────────────────────────────────────────

    private _getHtmlForWebview(_webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KelvCodes AI</title>
    <style>
        * { box-sizing: border-box; }
        body {
            background: var(--vscode-sideBar-background, #1e1e1e);
            color: var(--vscode-sideBar-foreground, #ccc);
            font-family: var(--vscode-font-family, system-ui, sans-serif);
            margin: 0; padding: 0;
            display: flex; flex-direction: column;
            height: 100vh; overflow: hidden;
        }
        #chat-container {
            flex: 1; overflow-y: auto;
            padding: 12px;
            display: flex; flex-direction: column; gap: 10px;
            scroll-behavior: smooth;
        }
        .message-wrapper { display: flex; flex-direction: column; max-width: 92%; animation: fadeIn 0.18s ease-out; }
        .message-wrapper.user { align-self: flex-end; }
        .message-wrapper.assistant { align-self: flex-start; max-width: 97%; }
        .message-sender { font-size: 10px; font-weight: 700; margin-bottom: 3px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.6px; }
        .user .message-sender { text-align: right; }
        .message-bubble { padding: 9px 13px; border-radius: 8px; font-size: 13px; line-height: 1.55; word-wrap: break-word; white-space: pre-wrap; }
        .user .message-bubble { background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff); border-bottom-right-radius: 2px; }
        .assistant .message-bubble { background: var(--vscode-editor-background, #252526); color: var(--vscode-editor-foreground, #d4d4d4); border: 1px solid var(--vscode-panel-border, #3c3c3c); border-bottom-left-radius: 2px; }

        /* Tool status pills */
        .tool-status-row { align-self: flex-start; }
        .tool-pill {
            display: inline-flex; align-items: center; gap: 6px;
            background: rgba(86,156,214,0.12); border: 1px solid rgba(86,156,214,0.3);
            border-radius: 20px; padding: 4px 10px; font-size: 11px; color: #569cd6;
            margin: 2px 0; animation: fadeIn 0.15s ease-out;
        }
        .tool-pill .spinner { width: 10px; height: 10px; border: 1.5px solid rgba(86,156,214,0.3); border-top-color: #569cd6; border-radius: 50%; animation: spin 0.7s linear infinite; }
        .tool-pill.done { opacity: 0.55; }
        .tool-pill.done .spinner { display: none; }
        .tool-pill.done::before { content: '✓ '; }

        /* Code blocks */
        .code-block-container { background: #1e1e1e; border: 1px solid #3c3c3c; border-radius: 6px; margin: 8px 0; overflow: hidden; font-family: var(--vscode-editor-font-family, monospace); }
        .code-block-header { display: flex; justify-content: space-between; align-items: center; background: #2d2d2d; padding: 5px 10px; font-size: 11px; border-bottom: 1px solid #3c3c3c; color: #888; }
        .code-block-lang { font-weight: 700; }
        .code-block-actions { display: flex; gap: 5px; }
        .code-block-actions button { background: transparent; border: none; color: #bbb; cursor: pointer; padding: 2px 7px; border-radius: 3px; font-size: 10px; transition: background 0.15s, color 0.15s; }
        .code-block-actions button:hover { background: #3e3e3e; color: #fff; }
        .btn-write { color: #569cd6 !important; font-weight: 600; }
        .btn-write:hover { background: rgba(86,156,214,0.15) !important; }
        .code-block-container pre { margin: 0; padding: 10px 12px; overflow-x: auto; }
        .code-block-container code { font-family: inherit; font-size: 12px; color: #d4d4d4; }

        /* Typing dots */
        .typing-indicator { display: flex; align-items: center; gap: 4px; padding: 5px 0; }
        .typing-indicator span { width: 6px; height: 6px; background: var(--vscode-sideBar-foreground, #ccc); border-radius: 50%; display: inline-block; opacity: 0.4; animation: bounce 1.4s infinite ease-in-out both; }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

        /* Inline code and text formatting */
        .inline-code { background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 12px; }
        .bullet-list { margin: 4px 0; padding-left: 18px; }
        .list-item { margin-bottom: 3px; }

        /* Input */
        .input-panel { padding: 10px 12px 12px; background: var(--vscode-sideBar-background, #1e1e1e); border-top: 1px solid var(--vscode-panel-border, #3c3c3c); }
        .input-wrapper { display: flex; align-items: flex-end; gap: 6px; background: var(--vscode-input-background, #252526); border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 6px; padding: 4px 6px; transition: border-color 0.15s; }
        .input-wrapper:focus-within { border-color: var(--vscode-focusBorder, #007acc); }
        #user-input { flex: 1; background: transparent; border: none; color: var(--vscode-input-foreground, #fff); font-family: inherit; font-size: 13px; resize: none; padding: 5px; max-height: 120px; outline: none; }
        #user-input::placeholder { color: var(--vscode-input-placeholderForeground, #888); }
        .input-buttons { display: flex; gap: 4px; margin-bottom: 2px; }
        #send-button, #stop-button { border: none; border-radius: 4px; padding: 5px 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
        #send-button { background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff); }
        #send-button:hover { background: var(--vscode-button-hoverBackground, #0062a3); }
        #send-button:disabled { opacity: 0.4; cursor: not-allowed; }
        #stop-button { background: rgba(244,135,113,0.15); color: #f48771; display: none; }
        #stop-button:hover { background: rgba(244,135,113,0.25); }
        #stop-button.visible { display: flex; }

        /* Scrollbar */
        #chat-container::-webkit-scrollbar, #user-input::-webkit-scrollbar { width: 5px; height: 5px; }
        #chat-container::-webkit-scrollbar-thumb, #user-input::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        #chat-container::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        #chat-container::-webkit-scrollbar-track { background: transparent; }

        /* Welcome */
        .welcome-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 24px; }
        .welcome-icon { font-size: 30px; margin-bottom: 10px; animation: float 3s ease-in-out infinite; }
        .welcome-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
        .welcome-desc { font-size: 11.5px; line-height: 1.5; color: var(--vscode-input-placeholderForeground, #888); }
        .welcome-chips { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 14px; }
        .chip { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 5px 10px; font-size: 11px; cursor: pointer; transition: background 0.15s; }
        .chip:hover { background: rgba(255,255,255,0.13); }

        @keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1);opacity:0.9} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes spin { to{transform:rotate(360deg)} }
    </style>
</head>
<body>
<div id="chat-container">
    <div class="welcome-container" id="welcome-message">
        <div class="welcome-icon">⚡</div>
        <div class="welcome-title">KelvCodes AI</div>
        <div class="welcome-desc">I can read, write, and edit files in your workspace autonomously. Just ask me anything.</div>
        <div class="welcome-chips">
            <div class="chip" onclick="sendChip(this)">Explore my project</div>
            <div class="chip" onclick="sendChip(this)">Write a README.md</div>
            <div class="chip" onclick="sendChip(this)">Explain active file</div>
            <div class="chip" onclick="sendChip(this)">Find bugs in my code</div>
        </div>
    </div>
</div>

<div class="input-panel">
    <div class="input-wrapper">
        <textarea id="user-input" placeholder="Ask KelvCodes AI anything..." rows="1"></textarea>
        <div class="input-buttons">
            <button id="stop-button" title="Stop generation">
                <svg viewBox="0 0 24 24" width="14" height="14"><rect x="4" y="4" width="16" height="16" fill="currentColor" rx="2"/></svg>
            </button>
            <button id="send-button" title="Send (Enter)">
                <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const stopButton = document.getElementById('stop-button');
    const welcomeEl = document.getElementById('welcome-message');

    let isStreaming = false;
    let currentBubble = null;
    let currentText = '';

    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    });

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitMessage(); }
    });

    sendButton.addEventListener('click', submitMessage);
    stopButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'stopGeneration' });
        finishStreaming();
    });

    function sendChip(el) {
        userInput.value = el.innerText;
        submitMessage();
    }

    function submitMessage() {
        const text = userInput.value.trim();
        if (!text || isStreaming) return;

        if (welcomeEl) welcomeEl.remove();

        appendBubble('user', text);
        vscode.postMessage({ type: 'sendMessage', value: text });

        userInput.value = '';
        userInput.style.height = 'auto';
        setStreaming(true);
        createAssistantBubble();
    }

    function setStreaming(val) {
        isStreaming = val;
        sendButton.disabled = val;
        userInput.disabled = val;
        stopButton.classList.toggle('visible', val);
    }

    function appendBubble(sender, text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ' + sender;

        const name = document.createElement('div');
        name.className = 'message-sender';
        name.innerText = sender === 'user' ? 'You' : 'KelvCodes AI';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble[sender === 'user' ? 'innerText' : 'innerHTML'] = sender === 'user' ? text : formatMarkdown(text);

        wrapper.appendChild(name);
        wrapper.appendChild(bubble);
        chatContainer.appendChild(wrapper);
        scrollToBottom();
        return bubble;
    }

    function createAssistantBubble() {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper assistant';

        const name = document.createElement('div');
        name.className = 'message-sender';
        name.innerText = 'KelvCodes AI';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

        wrapper.appendChild(name);
        wrapper.appendChild(bubble);
        chatContainer.appendChild(wrapper);

        currentBubble = bubble;
        currentText = '';
        scrollToBottom();
    }

    function addToolPill(label) {
        const row = document.createElement('div');
        row.className = 'message-wrapper tool-status-row';
        const pill = document.createElement('div');
        pill.className = 'tool-pill';
        pill.innerHTML = '<div class="spinner"></div>' + label;
        pill.dataset.label = label;
        row.appendChild(pill);
        chatContainer.appendChild(row);
        scrollToBottom();
        return pill;
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function copyCode(button) {
        const code = button.closest('.code-block-container').querySelector('code').innerText;
        navigator.clipboard.writeText(code).then(() => {
            button.innerText = 'Copied!';
            setTimeout(() => { button.innerText = 'Copy'; }, 2000);
        });
    }

    function insertCode(button) {
        const code = button.closest('.code-block-container').querySelector('code').innerText;
        vscode.postMessage({ type: 'insertAtCursor', value: code });
        button.innerText = 'Inserted!';
        setTimeout(() => { button.innerText = 'Insert'; }, 2000);
    }

    function replaceCode(button) {
        const code = button.closest('.code-block-container').querySelector('code').innerText;
        vscode.postMessage({ type: 'replaceActiveFile', value: code });
        button.innerText = 'Done!';
        setTimeout(() => { button.innerText = 'Replace Active'; }, 2000);
    }

    function formatMarkdown(text) {
        if (!text) return '';

        var escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // Hide WRITE_FILE tags from display (they're handled server-side now)
        escaped = escaped.replace(/\\[(?:WRITE_FILE|LIST_DIR|READ_FILE|DELETE_FILE):[^\\]]+\\]/g, function(m) {
            return '<span style="font-size:10px;opacity:0.45;font-style:italic;">' + m + '</span>';
        });

        var parts = escaped.split(/(\`{3}[\\s\\S]*?\`{3})/g);

        return parts.map(function(part) {
            if (part.indexOf('\`\`\`') === 0) {
                var match = part.match(/\`{3}(\\w*)\\n([\\s\\S]*?)(?:\`{3}|$)/);
                if (match) {
                    var lang = match[1] || 'code';
                    var code = match[2].trim();
                    return '<div class="code-block-container">' +
                        '<div class="code-block-header"><span class="code-block-lang">' + lang + '</span>' +
                        '<div class="code-block-actions">' +
                            '<button onclick="copyCode(this)">Copy</button>' +
                            '<button onclick="insertCode(this)">Insert</button>' +
                            '<button onclick="replaceCode(this)">Replace Active</button>' +
                        '</div></div>' +
                        '<pre><code class="language-' + lang + '">' + code + '</code></pre>' +
                        '</div>';
                }
                return part;
            } else {
                var f = part;
                f = f.replace(/\`([^\`\\n]+)\`/g, '<code class="inline-code">$1</code>');
                f = f.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
                f = f.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
                f = f.replace(/^#{1,3}\\s+(.+)$/gm, '<strong>$1</strong>');

                var lines = f.split('\\n'), inList = false, out = [];
                for (var i = 0; i < lines.length; i++) {
                    var l = lines[i], lm = l.match(/^[-*]\\s+(.+)/);
                    if (lm) {
                        if (!inList) { inList = true; out.push('<ul class="bullet-list">'); }
                        out.push('<li class="list-item">' + lm[1] + '</li>');
                    } else {
                        if (inList) { inList = false; out.push('</ul>'); }
                        out.push(l);
                    }
                }
                if (inList) out.push('</ul>');
                return out.map(function(l) {
                    return (l.indexOf('<ul') === 0 || l.indexOf('</ul') === 0 || l.indexOf('<li') === 0) ? l : l + '<br>';
                }).join('\\n');
            }
        }).join('');
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.type) {
            case 'stream-token':
                if (currentBubble) {
                    const loader = currentBubble.querySelector('.typing-indicator');
                    if (loader) loader.remove();
                    currentText += msg.value;
                    currentBubble.innerHTML = formatMarkdown(currentText);
                    scrollToBottom();
                }
                break;

            case 'tool-status':
                // Between AI turns — show a tool pill and start a fresh bubble
                if (currentBubble && currentText) {
                    currentBubble = null;
                    currentText = '';
                }
                addToolPill(msg.value);
                break;

            case 'tool-results':
                // Mark all pending pills as done and open new AI bubble
                document.querySelectorAll('.tool-pill:not(.done)').forEach(p => p.classList.add('done'));
                createAssistantBubble();
                break;

            case 'stream-done':
                finishStreaming();
                break;

            case 'stream-error':
                if (currentBubble) {
                    const loader = currentBubble.querySelector('.typing-indicator');
                    if (loader) loader.remove();
                    const err = document.createElement('div');
                    err.style.cssText = 'color:#f48771;font-weight:bold;margin-top:4px';
                    err.innerText = 'Error: ' + msg.value;
                    currentBubble.appendChild(err);
                    scrollToBottom();
                }
                finishStreaming();
                break;

            case 'clear-chat':
                chatContainer.innerHTML =
                    '<div class="welcome-container" id="welcome-message">' +
                    '<div class="welcome-icon">⚡</div>' +
                    '<div class="welcome-title">KelvCodes AI</div>' +
                    '<div class="welcome-desc">I can read, write, and edit files in your workspace autonomously. Just ask me anything.</div>' +
                    '<div class="welcome-chips">' +
                    '<div class="chip" onclick="sendChip(this)">Explore my project</div>' +
                    '<div class="chip" onclick="sendChip(this)">Write a README.md</div>' +
                    '<div class="chip" onclick="sendChip(this)">Explain active file</div>' +
                    '<div class="chip" onclick="sendChip(this)">Find bugs in my code</div>' +
                    '</div></div>';
                finishStreaming();
                break;
        }
    });

    function finishStreaming() {
        currentBubble = null;
        currentText = '';
        setStreaming(false);
        userInput.focus();
    }
</script>
</body>
</html>`;
    }
}
