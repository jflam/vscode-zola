import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	
	console.log('vscode-zola activated');

	let pasteSpecial = vscode.commands.registerCommand('vscode-zola.pasteSpecial', () => {
		vscode.window.showInformationMessage('TODO: paste stuff');
	});

	let previewBlog = vscode.commands.registerCommand('vscode-zola.previewBlog', () => {
		vscode.window.showInformationMessage('TODO: open web view');
	});

	context.subscriptions.push(pasteSpecial);
	context.subscriptions.push(previewBlog);
}

// this method is called when your extension is deactivated
export function deactivate() {}
