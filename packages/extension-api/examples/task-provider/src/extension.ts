/**
 * Custom Task Provider Extension Example
 * 
 * Demonstrates how to create a custom task provider for Note Studio
 */

import vscode from '@note-studio/extension-api';

interface CustomTaskDefinition extends vscode.TaskDefinition {
  script: string;
  args?: string[];
}

class CustomTaskProvider implements vscode.tasks.TaskProvider {
  private tasks: vscode.Task[] | undefined;

  constructor(private workspaceRoot: string) {}

  public async provideTasks(): Promise<vscode.Task[]> {
    return this.getTasks();
  }

  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as CustomTaskDefinition;
    
    if (definition.script) {
      return this.createTask(definition);
    }
    
    return undefined;
  }

  private getTasks(): vscode.Task[] {
    if (this.tasks !== undefined) {
      return this.tasks;
    }

    this.tasks = [];

    // Example predefined tasks
    const predefinedTasks = [
      {
        script: 'npm run build',
        args: [],
        name: 'Build Project',
        group: vscode.tasks.TaskGroup.Build
      },
      {
        script: 'npm test',
        args: [],
        name: 'Run Tests',
        group: vscode.tasks.TaskGroup.Test
      },
      {
        script: 'npm run lint',
        args: [],
        name: 'Lint Code',
        group: undefined
      },
      {
        script: 'echo',
        args: ['Hello from custom task!'],
        name: 'Say Hello',
        group: undefined
      }
    ];

    predefinedTasks.forEach(taskDef => {
      const definition: CustomTaskDefinition = {
        type: 'customTask',
        script: taskDef.script,
        args: taskDef.args
      };

      const task = this.createTask(definition, taskDef.name, taskDef.group);
      this.tasks!.push(task);
    });

    return this.tasks;
  }

  private createTask(
    definition: CustomTaskDefinition,
    name?: string,
    group?: vscode.tasks.TaskGroup
  ): vscode.Task {
    const taskName = name || definition.script;
    const args = definition.args || [];
    
    const commandLine = args.length > 0
      ? `${definition.script} ${args.join(' ')}`
      : definition.script;

    const execution = new vscode.tasks.ShellExecution(commandLine, {
      cwd: this.workspaceRoot
    });

    const task = new vscode.Task(
      definition,
      vscode.tasks.TaskScope.Workspace,
      taskName,
      'customTask',
      execution,
      [] // problem matchers
    );

    if (group) {
      task.group = group;
    }

    task.presentationOptions = {
      reveal: vscode.tasks.TaskRevealKind.Always,
      echo: true,
      focus: false,
      panel: vscode.tasks.TaskPanelKind.Shared,
      showReuseMessage: true,
      clear: false
    };

    return task;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Custom Task Provider extension is now active!');

  // Get workspace root
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.warn('No workspace folder found');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Register task provider
  const taskProvider = vscode.tasks.registerTaskProvider(
    'customTask',
    new CustomTaskProvider(workspaceRoot)
  );

  // Create output channel
  const outputChannel = vscode.window.createOutputChannel('Custom Tasks');
  outputChannel.appendLine('Custom Task Provider activated!');

  // Register command to run a task
  const runTaskCommand = vscode.commands.registerCommand('customTask.runTask', async () => {
    // Fetch all tasks
    const tasks = await vscode.tasks.fetchTasks({ type: 'customTask' });
    
    if (tasks.length === 0) {
      vscode.window.showWarningMessage('No custom tasks available');
      return;
    }

    // Show task picker
    const taskItems = tasks.map(task => ({
      label: task.name,
      description: task.definition.script,
      task
    }));

    const selected = await vscode.window.showQuickPick(taskItems, {
      placeHolder: 'Select a task to run'
    });

    if (selected) {
      outputChannel.appendLine(`Running task: ${selected.label}`);
      outputChannel.show(true);

      try {
        const execution = await vscode.tasks.executeTask(selected.task);
        vscode.window.showInformationMessage(`Task "${selected.label}" started`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to run task: ${error}`);
        outputChannel.appendLine(`Error: ${error}`);
      }
    }
  });

  // Listen for task start/end events
  const taskStartListener = vscode.tasks.onDidStartTask(e => {
    const taskName = e.task.name;
    outputChannel.appendLine(`Task started: ${taskName}`);
    vscode.window.showInformationMessage(`Task "${taskName}" is running...`);
  });

  const taskEndListener = vscode.tasks.onDidEndTask(e => {
    const taskName = e.task.name;
    outputChannel.appendLine(`Task completed: ${taskName}`);
    vscode.window.showInformationMessage(`Task "${taskName}" completed!`);
  });

  // Add status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = '$(play) Run Custom Task';
  statusBarItem.tooltip = 'Click to run a custom task';
  statusBarItem.command = 'customTask.runTask';
  statusBarItem.show();

  // Add all disposables to context
  context.subscriptions.push(
    taskProvider,
    runTaskCommand,
    taskStartListener,
    taskEndListener,
    statusBarItem,
    outputChannel
  );

  console.log('Custom Task Provider fully activated!');
}

export function deactivate() {
  console.log('Custom Task Provider deactivated!');
}



