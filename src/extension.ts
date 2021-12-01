import * as vscode from 'vscode';
import * as fs from 'fs';

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

function getTextClipboardData(callback: (text: string) => void) {

	// Use the built-in clipboard to read the contents of the clipboard Other
	// extensions, e.g., vscode-paste-special have a switch that invokes
	// different system utilities, e.g., winclip.exe or gtkclip, but I wonder
	// if this is necessary today? I'll need to test to make sure, but it
	// would be really nice if I could simplify things here.
	vscode.env.clipboard.readText().then((text) => {
		callback(text);
	});
}

// The activation function is activated when VS Code opens a workspace that
// contains a config.toml file in the root directory of the workspace
export function activate(context: vscode.ExtensionContext) {
	
	console.log('vscode-zola activated');

	// The Paste Special examines URIs on the clipboard and converts matching
	// URIs into special short codes that can be used to generate special
	// formatting for sites like YouTube and Twitter.
	let pasteSpecial = vscode.commands.registerCommand('vscode-zola.pasteSpecial', () => {
		// Regular expressions for extracting IDs out of commonly copied URIs:

		// https://www.youtube.com/watch?v=rgHEmK2mE7Q => rgHEmK2mE7Q  
		const regexpYouTube = /youtube.com\/watch\?v=(.*)/g;

		// https://twitter.com/ckindel/status/1462284494258405384 => 1462284494258405384 
		const regexpTwitter = /twitter.com\/(.*)\/status\/(.*)/g;

		// https://www.instagram.com/p/CW1JQJ1Paul/ => CW1JQJ1Paul
		const regexpInstagram = /instagram.com\/p\/(.*)\/.*/g;

		getTextClipboardData((text) => {
			// Front-end filter for all URIs before looking for specialized ones
			const regexpUri = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
			var m0 = regexpUri.exec(text);
			if (m0 !== null) {
				var m1 = regexpYouTube.exec(text);
				if (m1 !== null) {
					var id = m1[1];
					insertIntoActiveEditor(`{{ youtube(id="${id}")}}`);
					return;
				}

				var m2 = regexpTwitter.exec(text);
				if (m2 !== null) {
					var id = m2[2];
					insertIntoActiveEditor(`{{ twitter(id="${id}")}}`);
					return;
				}

				var m3 = regexpInstagram.exec(text);
				if (m3 !== null) {
					var id = m3[1];
					insertIntoActiveEditor(`{{ instagram(id="${id}")}}`);
					return;
				}
			}

			// Otherwise just paste contents of clipboard into editor
			insertIntoActiveEditor(text);
		});
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

	let blockSelection = vscode.commands.registerCommand('vscode-zola.blockSelection', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const doc = editor.document;
			editor.edit(editBuilder => {
				if (editor.selection.isEmpty) {
					// TODO: figure out how to place cursor between the blocks inserted
					editBuilder.insert(editor.selection.active, `
{% block() %}

{% end %}
					`);
				} else {
					editor.selections.forEach(sel => {
						const range = sel.isEmpty ? doc.getWordRangeAtPosition(sel.start) || sel : sel;
						editBuilder.insert(sel.start, "{% block() %}\n");
						editBuilder.insert(sel.end, "\n{% end %}");
					});
				}
			});
		}
	});

	// Create a new blog post by taking today's date and creating a new 
	// directory content/yyyy-mm-dd/ and a new file index.md in that directory
	let newPost = vscode.commands.registerCommand('vscode-zola.openTodayPost', async () => {
		const currentDate = new Date();
		const offset = currentDate.getTimezoneOffset();
		const localDate = new Date(currentDate.getTime() - (offset * 60 * 1000));
		const date = localDate.toISOString().split('T')[0];

		const blogDir = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath)[0];
		if (blogDir) {
			const newDir = `${blogDir}/content/${date}`;
			const newFile = `${newDir}/index.md`;
			if (!fs.existsSync(newDir)) {
				fs.mkdirSync(newDir);
			}
			if (!fs.existsSync(newFile)) {
				fs.writeFileSync(newFile, `
+++
title="${date}"
date=${date}
+++
`);
			}

			// Open the index.md file (newFile) in editor
			const uri = vscode.Uri.parse(`file://${newFile}`);
			const doc = await vscode.workspace.openTextDocument(uri);
			vscode.window.showTextDocument(doc);
		}
	});

	context.subscriptions.push(pasteSpecial);
	context.subscriptions.push(previewBlog);
	context.subscriptions.push(newPost);
	context.subscriptions.push(blockSelection);
}

// this method is called when your extension is deactivated
export function deactivate() {}
