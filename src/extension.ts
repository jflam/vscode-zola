import * as vscode from 'vscode';
const { exec } = require('child_process');

// Helper function that extracts the directory name of the file that is open
// in the currently active editor
function getDocumentWorkspaceFolder(): string | undefined {
	const fileName = vscode.window.activeTextEditor?.document.fileName;
	return vscode.workspace.workspaceFolders
	  ?.map((folder) => folder.uri.fsPath)
	  .filter((fsPath) => fileName?.startsWith(fsPath))[0];
}

// Insert text into the active editor window, either replacing current 
// selection or inserting at current cursor position of no selection
function insertIntoActiveEditor(text: string) {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const doc = editor.document;
		editor.edit(editBuilder => {
			if (editor.selection.isEmpty) {
				// Insert at current cursor location
				editBuilder.insert(editor.selection.active, text);
			} else {
				// Replace current selection(s). It's pretty cool that
				// this will do multi-selection replace!
				editor.selections.forEach(sel => {
					const range = sel.isEmpty ? doc.getWordRangeAtPosition(sel.start) || sel : sel;
					editBuilder.replace(range, text);
				});
			}
		});
	}
}

// The activation function is activated when VS Code opens a workspace that
// contains a config.toml file in the root directory of the workspace
export function activate(context: vscode.ExtensionContext) {
	
	console.log('vscode-zola activated');

	let pasteSpecial = vscode.commands.registerCommand('vscode-zola.pasteSpecial', () => {
		// Paste a hard-coded string into the active editor
		const text = "{{ youtube(id='V7707zEX9X4')}}";
		insertIntoActiveEditor(text);
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
