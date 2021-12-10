import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

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

function getZolaContent(uri: string) {
	return `
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
	<iframe src="${uri}"></iframe>
	<!-- HACK to generate unique HTML each time called ${Math.random()} -->
</body>
</html>
`;
}

function getRelativePathToZolaFile(workspacePath: string, editorPath: string) {
	var contentDir = workspacePath + "/content";
	var currentFileDir = path.dirname(editorPath);
	var relativeFileDir = currentFileDir.replace(contentDir, "");
	return relativeFileDir;
}

// Return a Windows full path for referencing a path within the current WSL2
// distribution:
//
// WSL2 path: /home/jlam/src/jflam.github.io
// Windows path: \\wsl.localhost\Ubuntu-20.04\home\jlam\src\jflam.github.io
// 
// The current WSL 2 diistribution name is set in $WSL_DISTRO_NAME
function getWindowsFullPath(path: string): string {
	let distro = process.env.WSL_DISTRO_NAME;
	let windowsPath = path.replace(/\//g, '\\');
	return `\\\\wsl.localhost\\${distro}\\${windowsPath}`;
}

// Detection function for running under WSL2
function isWSL2(): boolean {
	let kernelRelease = cp.execSync("uname -r").toString();
	return kernelRelease.indexOf("WSL2") > 0;
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

function pad(value: number, pad: number) {
	let paddedNumber = "000000" + value;
	return paddedNumber.substr(paddedNumber.length - pad);
}

function generateFilename() {
	let now = new Date();
	let yyyy = pad(now.getFullYear(), 4);
	let mm = pad(now.getMonth(), 2);
	let dd = pad(now.getDate(), 2);
	let h = pad(now.getHours(), 2);
	let m = pad(now.getMinutes(), 2);
	let s = pad(now.getSeconds(), 2);
	return `${yyyy}-${mm}-${dd}-${h}-${m}-${s}.png`;
}

function insertMarkdownImageReference(imagePath: string) {
	let folderPath = getDocumentWorkspaceFolder();
	if (folderPath !== undefined) {
		let containingFolderPath = getRelativePathToZolaFile(folderPath, imagePath);
		let relativeImagePath = `${containingFolderPath}/${path.basename(imagePath)}`;
		insertIntoActiveEditor(`![](${relativeImagePath})`);
	}
}

// The activation function is activated when VS Code opens a workspace that
// contains a config.toml file in the root directory of the workspace
export function activate(context: vscode.ExtensionContext) {
	
	console.log('vscode-zola activated');

	let zolaPreview: vscode.WebviewPanel;
	let zolaOutput: vscode.OutputChannel;
	let zolaTerminal: vscode.Terminal;

	function logOutput(message: string) {
		if (zolaOutput === undefined) {
			zolaOutput = vscode.window.createOutputChannel("zola");
		}
		zolaOutput.appendLine(message);
	}

	let pasteImage = vscode.commands.registerCommand('vscode-zola.pasteImage', () => {
		var editor = vscode.window.activeTextEditor;
		if (editor === undefined) {
			return;
		}
		var editorPath = editor.document.fileName;
		if (editorPath === undefined) {
			return;
		}
		if (path.extname(editorPath) !== ".md") {
			return;
		}
		if (process.platform === 'darwin') {
			logOutput("Pasting ...");
			// Paste the image by shelling out to the applescript porgram
            let scriptPath = path.join(__dirname, '../src/paste_image.applescript');
			let imageFileName = generateFilename();
			let imagePath = path.join(path.dirname(editorPath), imageFileName);
			cp.exec(`osascript ${scriptPath} ${imagePath}`, (error, stdout, stderr) => {
				if (error !== null && error.message !== null) {
					logOutput(error.message);
				} else {
					let returnedImagePath = stdout.toString().trim();
					insertMarkdownImageReference(returnedImagePath);
					logOutput(`Wrote output file to: ${returnedImagePath}`);
				}
			});
		} else {
			// TODO: implement other platforms
			return;
		}
	});

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

		// If zolaPreview is defined then exit - the preview window has 
		// already been created
		if (zolaPreview !== undefined) {
			return;
		}

		// If the current editor is undefined, then exit
		const currentEditorPath = vscode.window.activeTextEditor?.document.fileName;
		if (currentEditorPath === undefined) {
			return;
		}

		// If the current editor isn't editing a markdown file then exit
		if (path.extname(currentEditorPath) !== ".md") {
			return;
		}

		// Retrieve the workspaceFolder which I'm assuming here is the 
		// directory that contains the zola blog (I could be wrong too ...)
		const folderPath = getDocumentWorkspaceFolder();
		if (folderPath === undefined) {
			return;
		}

		// The package of zolaOutput, zolaPreview and zolaTerminal are all
		// together - but keeping guards here for the creation just in case
		// Create all three of these now

		// I'm not entirely sure we need this window, but keeping this for 
		// all of our debug output for now
		if (zolaOutput === undefined) {
			zolaOutput = vscode.window.createOutputChannel("zola");
		}

		// Create a webview panel to the right of the current editor
		if (zolaPreview === undefined) {
			zolaPreview = vscode.window.createWebviewPanel(
				'vscode-zola.preview',
				'Zola Preview',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true
				}
			);
		}

		// Output of the zola serve command will go to this window
		if (zolaTerminal === undefined) {
			zolaTerminal = vscode.window.createTerminal(`zola serve`);
		}

		// A good user experience is that if we encounter an error in Zola
		// during startup that we pop

		// Another good user experience is that if we run into a problem 
		// with rendering that we do something in the generated HTML to pop
		// a banner at the top in red to indicate that there is a problem
		// that should be doable since I control the HTML in the web view

		// TODO: understand lifetime management for extensions to know when
		// to output the shutting down zola message
		zolaOutput.appendLine(`Starting zola in ${folderPath}...`);

		if (folderPath !== undefined) {
			zolaTerminal.sendText(`cd ${folderPath}`);
			zolaTerminal.sendText(`zola serve`);
		}

		var relativeFileDir = getRelativePathToZolaFile(folderPath, currentEditorPath);
		var uri = `http://localhost:1111${relativeFileDir}`;
		zolaPreview.webview.html = getZolaContent(uri);
		zolaOutput.appendLine(`Open zola preview: ${uri}`);

		// Now watch for changes to currentEditorPath and update if that changes
		// Note the polling interval is 500ms
		fs.watchFile(currentEditorPath, { interval: 500 }, (curr, prev) => {
			if (path.extname(currentEditorPath) === ".md") {
				zolaPreview.webview.html = getZolaContent(uri);
				zolaOutput.appendLine(`Re-render zola post: ${uri}`);
			}
		});
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

	// Function that subscribes to the onDidChangeActiveTextEditor event
	let editorChanged = vscode.window.onDidChangeActiveTextEditor((editor) => {

		// Look up the zola preview window (we close over this) and if it is
		// defined, and the editor is editing a zola markdown file then update
		// the preview window's uri to point at this file's content

		if (editor !== undefined) {
			const folderPath = getDocumentWorkspaceFolder();
			if (folderPath === undefined) {
				return;
			}
			var editorPath = editor.document.fileName;
			var relativeFileDir = getRelativePathToZolaFile(folderPath, editorPath);
			var uri = `http://localhost:1111${relativeFileDir}`;
			zolaPreview.webview.html = getZolaContent(uri);
			zolaOutput.appendLine(`Editor changed to: ${uri}`);
		}
	});

	context.subscriptions.push(pasteImage);
	context.subscriptions.push(pasteSpecial);
	context.subscriptions.push(previewBlog);
	context.subscriptions.push(newPost);
	context.subscriptions.push(blockSelection);
	context.subscriptions.push(editorChanged);
}

// this method is called when your extension is deactivated
export function deactivate() {}
