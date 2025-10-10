# Hello World Extension Example

This is a simple example extension that demonstrates how to use the `@note-studio/extension-api` package to create VSCode-compatible extensions for Note Studio.

## Features

This example demonstrates:

- ✅ **Command Registration** - Register custom commands
- ✅ **Configuration** - Read and react to configuration changes
- ✅ **User Input** - Show input boxes and quick picks
- ✅ **Messages** - Display information, warning, and error messages
- ✅ **Output Channel** - Create and write to output channels
- ✅ **Status Bar** - Add status bar items
- ✅ **Text Editor Integration** - Insert text into active editor
- ✅ **Completion Provider** - Provide autocomplete suggestions
- ✅ **Event Handling** - Listen to configuration changes

## Commands

This extension contributes the following commands:

- `Hello World: Say Hello` - Shows an input box asking for your name and displays a greeting
- `Hello World: Show Commands` - Shows all available commands in a quick pick
- `Hello World: Show Output` - Shows the extension's output channel
- `Hello World: Insert Greeting` - Inserts a greeting at the cursor position

## Configuration

This extension contributes the following settings:

- `helloWorld.greeting` - The greeting message to display (default: "Hello")

You can change this in your settings:

```json
{
  "helloWorld.greeting": "Hi"
}
```

## Usage

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Compile the Extension

```bash
pnpm run compile
```

Or watch for changes:

```bash
pnpm run watch
```

### 3. Run in Note Studio

The compiled extension will be in the `dist` folder. Load it in Note Studio's extension manager.

## Code Overview

### Extension Activation

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Register commands, providers, etc.
}
```

The `activate` function is called when the extension is activated. This is where you register all your commands, providers, and event listeners.

### Command Registration

```typescript
const command = vscode.commands.registerCommand('helloWorld.sayHello', async () => {
  const name = await vscode.window.showInputBox({
    prompt: 'What is your name?'
  });
  
  if (name) {
    vscode.window.showInformationMessage(`Hello, ${name}!`);
  }
});

context.subscriptions.push(command);
```

### Configuration Access

```typescript
const config = vscode.workspace.getConfiguration('helloWorld');
const greeting = config.get<string>('greeting', 'Hello');
```

### Output Channel

```typescript
const outputChannel = vscode.window.createOutputChannel('Hello World');
outputChannel.appendLine('Extension started!');
outputChannel.show();
```

### Status Bar Item

```typescript
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);
statusBarItem.text = '$(heart) Hello World';
statusBarItem.command = 'helloWorld.sayHello';
statusBarItem.show();
```

### Completion Provider

```typescript
const provider = vscode.languages.registerCompletionItemProvider(
  { scheme: 'file', language: 'markdown' },
  {
    provideCompletionItems(document, position) {
      const completionItem = new vscode.CompletionItem('Hello, World!');
      completionItem.kind = vscode.CompletionItemKind.Text;
      return [completionItem];
    }
  },
  'o' // Trigger character
);
```

## Learn More

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Note Studio Extension API](../../README.md)
- [Extension Guides](https://code.visualstudio.com/api/extension-guides/overview)

## License

MIT



