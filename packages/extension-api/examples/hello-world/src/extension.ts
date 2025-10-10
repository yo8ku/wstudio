/**
 * Hello World Extension Example
 * 
 * This is a simple example demonstrating how to create a VSCode extension
 * that works with Note Studio using the extension-api package.
 */

import vscode from '@note-studio/extension-api';

/**
 * This function is called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Hello World extension is now active!');

  // ============= Command Registration =============
  
  // Register the "Say Hello" command
  const helloCommand = vscode.commands.registerCommand('helloWorld.sayHello', async () => {
    // Get the greeting from configuration
    const config = vscode.workspace.getConfiguration('helloWorld');
    const greeting = config.get<string>('greeting', 'Hello');

    // Show information message
    const name = await vscode.window.showInputBox({
      prompt: 'What is your name?',
      placeHolder: 'Enter your name'
    });

    if (name) {
      vscode.window.showInformationMessage(`${greeting}, ${name}! 🎉`);
    }
  });

  // Register a command to show all available commands
  const showCommandsCommand = vscode.commands.registerCommand('helloWorld.showCommands', async () => {
    const commands = await vscode.commands.getCommands(true);
    const selected = await vscode.window.showQuickPick(commands, {
      placeHolder: 'Select a command to execute'
    });

    if (selected) {
      await vscode.commands.executeCommand(selected);
    }
  });

  // ============= Output Channel =============
  
  const outputChannel = vscode.window.createOutputChannel('Hello World');
  outputChannel.appendLine('Hello World extension started!');
  outputChannel.appendLine(`Activated at: ${new Date().toLocaleString()}`);

  // Register a command to show output
  const showOutputCommand = vscode.commands.registerCommand('helloWorld.showOutput', () => {
    outputChannel.show();
    outputChannel.appendLine('Output channel shown at: ' + new Date().toLocaleTimeString());
  });

  // ============= Status Bar =============
  
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(heart) Hello World';
  statusBarItem.tooltip = 'Click to say hello';
  statusBarItem.command = 'helloWorld.sayHello';
  statusBarItem.show();

  // ============= Configuration Change Handler =============
  
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('helloWorld.greeting')) {
      const newGreeting = vscode.workspace.getConfiguration('helloWorld').get<string>('greeting');
      outputChannel.appendLine(`Greeting changed to: ${newGreeting}`);
      vscode.window.showInformationMessage(`Greeting updated to: ${newGreeting}`);
    }
  });

  // ============= Text Editor Integration =============
  
  const editorCommand = vscode.commands.registerCommand('helloWorld.insertGreeting', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active text editor!');
      return;
    }

    const config = vscode.workspace.getConfiguration('helloWorld');
    const greeting = config.get<string>('greeting', 'Hello');

    await editor.edit(editBuilder => {
      editBuilder.insert(editor.selection.active, `${greeting}, World!`);
    });

    vscode.window.showInformationMessage('Greeting inserted!');
  });

  // ============= Completion Provider Example =============
  
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'markdown' },
    {
      provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        
        if (!linePrefix.endsWith('hello')) {
          return undefined;
        }

        const config = vscode.workspace.getConfiguration('helloWorld');
        const greeting = config.get<string>('greeting', 'Hello');

        const completionItem = new vscode.CompletionItem(`${greeting}, World!`);
        completionItem.kind = vscode.CompletionItemKind.Text;
        completionItem.detail = 'Insert hello world greeting';
        completionItem.insertText = `, World! 🌍`;

        return [completionItem];
      }
    },
    'o' // Trigger on 'o' (after 'hell')
  );

  // ============= Add all disposables to context =============
  
  context.subscriptions.push(
    helloCommand,
    showCommandsCommand,
    showOutputCommand,
    editorCommand,
    statusBarItem,
    outputChannel,
    configChangeListener,
    completionProvider
  );

  // Log successful activation
  console.log('Hello World extension fully activated!');
  outputChannel.appendLine('All features registered successfully!');
}

/**
 * This function is called when the extension is deactivated
 */
export function deactivate() {
  console.log('Hello World extension is now deactivated!');
}



