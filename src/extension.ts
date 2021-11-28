import * as vscode from 'vscode';
const { exec } = require('child_process');

function getDocumentWorkspaceFolder(): string | undefined {
	const fileName = vscode.window.activeTextEditor?.document.fileName;
	return vscode.workspace.workspaceFolders
	  ?.map((folder) => folder.uri.fsPath)
	  .filter((fsPath) => fileName?.startsWith(fsPath))[0];
}

export function activate(context: vscode.ExtensionContext) {
	
	console.log('vscode-zola activated');

	let pasteSpecial = vscode.commands.registerCommand('vscode-zola.pasteSpecial', () => {
		vscode.window.showInformationMessage('TODO: paste stuff');
	});

	let previewBlog = vscode.commands.registerCommand('vscode-zola.previewBlog', () => {

		// TODO: some kind of intelligent flow control to test of process
		// is running already?
		const terminal = vscode.window.createTerminal(
			`zola serve`);
		const folderPath = getDocumentWorkspaceFolder();
		console.log(folderPath);
		if (folderPath !== undefined) {
			terminal.sendText(`cd ${folderPath}`);
			terminal.sendText(`zola serve`);
		}

		// Create a webview panel to the right of the current editor
		const panel = vscode.window.createWebviewPanel(
			'vscode-zola.preview',
			'Zola Preview',
			vscode.ViewColumn.Beside
		);
		// Inject an IFRAME into the panel that retrieves zola preview
		panel.webview.html = `
		<html lang="en"">
		<head>
			<meta charset="UTF-8">
			<title>Preview</title>
			<style>
				html { width: 100%; height: 100%; min-height: 100%; display: flex; }
				body { flex: 1; display: flex; }
				iframe { flex: 1; border: none; background: white; }
			</style>
		</head>
		<body>
			<iframe src="http://localhost:1111"></iframe>
		</body>
		</html>
		`;
	});

	context.subscriptions.push(pasteSpecial);
	context.subscriptions.push(previewBlog);
}

// this method is called when your extension is deactivated
export function deactivate() {}
