import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';

/**
 * Capture the currently active text editor's filename and code contents.
 */
export function getActiveFileContext(): { filename: string; content: string } | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }
    const document = editor.document;
    if (document.isClosed || document.uri.scheme !== 'file') {
        return null;
    }
    
    const fullPath = document.fileName;
    const filename = fullPath.replace(/^.*[\\\/]/, ''); // Cross-platform basename extract
    const content = document.getText();
    
    return {
        filename,
        content
    };
}

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new SidebarProvider(context.extensionUri);

    // Register Renamed Webview Sidebar View
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "kelvcodes-ai.chatView",
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Register Renamed Chat Reset Command
    context.subscriptions.push(
        vscode.commands.registerCommand("kelvcodes-ai.resetChat", () => {
            sidebarProvider.resetChat();
        })
    );
}

export function deactivate() {}
