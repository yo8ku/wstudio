/**
 * Python 服务桥接器
 * 用于 TypeScript 与 Python 服务之间的通信
 * 支持 Node.js 环境（直接启动 Python 进程）和浏览器环境（通过 IPC）
 */
// 检测运行环境
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
// 获取 Electron IPC（仅在浏览器环境中）
function getElectronIPC() {
    if (!isBrowser) {
        return null;
    }
    const windowWithElectron = window;
    return windowWithElectron.electron?.ipcRenderer || null;
}
// 缓存动态导入的模块
let pathModule = null;
let childProcessModule = null;
// 获取 path 模块
async function getPathModule() {
    if (isBrowser) {
        throw new Error('path module is not available in browser environment.');
    }
    if (!pathModule) {
        try {
            // 使用 Function 构造函数创建完全动态的导入，避免 Vite 静态分析
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            pathModule = await dynamicImport('path');
        }
        catch (error) {
            throw new Error('path module is not available. Please ensure you are running in Node.js environment.');
        }
    }
    return pathModule;
}
// 获取 child_process 模块
async function getChildProcessModule() {
    if (isBrowser) {
        throw new Error('child_process module is not available in browser environment.');
    }
    if (!childProcessModule) {
        try {
            // 使用 Function 构造函数创建完全动态的导入，避免 Vite 静态分析
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            childProcessModule = await dynamicImport('child_process');
        }
        catch (error) {
            throw new Error('child_process module is not available. Please ensure you are running in Node.js environment.');
        }
    }
    return childProcessModule;
}
/**
 * 让出控制权给 UI 线程，避免阻塞
 */
function yieldToUI() {
    return new Promise((resolve) => {
        // 使用 setImmediate 或 setTimeout 让 UI 有机会响应
        if (typeof setImmediate !== 'undefined') {
            setImmediate(() => {
                setTimeout(resolve, 0);
            });
        }
        else {
            setTimeout(resolve, 0);
        }
    });
}
/**
 * 异步执行命令（替代 execSync，避免阻塞 UI）
 */
async function execAsync(command, options) {
    const childProcess = await getChildProcessModule();
    return new Promise((resolve, reject) => {
        const execOptions = {
            timeout: options.timeout,
            env: options.env || process.env,
            cwd: options.cwd,
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        };
        childProcess.exec(command, execOptions, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }
            else {
                const stdoutStr = stdout instanceof Buffer ? stdout.toString() : (typeof stdout === 'string' ? stdout : String(stdout));
                const stderrStr = stderr instanceof Buffer ? stderr.toString() : (typeof stderr === 'string' ? stderr : String(stderr));
                resolve({
                    stdout: stdoutStr,
                    stderr: stderrStr
                });
            }
        });
    });
}
/**
 * 获取项目内置的独立 Python 可执行文件路径
 * 项目包含内置的 Python 环境，位于 python_bundle/python-3.13.9-embed/
 * 不需要检查用户的本地 Python 环境
 */
async function detectPythonExecutable() {
    const childProcess = await getChildProcessModule();
    const path = await getPathModule();
    const fsModule = await new Function('specifier', 'return import(specifier)')('fs');
    // 让出控制权给 UI
    await yieldToUI();
    // 根据平台确定 Python 可执行文件名
    const pythonExecutableName = process.platform === 'win32' ? 'python.exe' : 'python';
    const pythonBundlePath = path.join('python_bundle', 'python-3.13.9-embed', pythonExecutableName);
    // 尝试多种方式查找项目根目录
    const searchPaths = [];
    // 方法1: 从当前文件位置向上查找
    const currentFile = typeof __filename !== 'undefined' ? __filename : '';
    if (currentFile) {
        let currentDir = path.dirname(currentFile);
        // 从 packages/global-rag/src/python/bridge 或 dist/python/bridge 向上查找
        for (let i = 0; i < 6; i++) {
            const testPath = path.join(currentDir, pythonBundlePath);
            searchPaths.push(testPath);
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                // 已到达根目录
                break;
            }
            currentDir = parentDir;
        }
    }
    // 方法2: 从 process.cwd() 查找（工作目录通常是项目根目录）
    const cwd = process.cwd();
    searchPaths.push(path.join(cwd, pythonBundlePath));
    // 方法3: 从 __dirname 查找（如果可用）
    if (typeof __dirname !== 'undefined') {
        let dirnamePath = __dirname;
        for (let i = 0; i < 6; i++) {
            const testPath = path.join(dirnamePath, pythonBundlePath);
            if (!searchPaths.includes(testPath)) {
                searchPaths.push(testPath);
            }
            const parentDir = path.dirname(dirnamePath);
            if (parentDir === dirnamePath) {
                break;
            }
            dirnamePath = parentDir;
        }
    }
    // 让出控制权给 UI
    await yieldToUI();
    // 尝试每个路径
    for (let i = 0; i < searchPaths.length; i++) {
        const pythonPath = searchPaths[i];
        try {
            // 检查文件是否存在
            if (fsModule.existsSync && fsModule.existsSync(pythonPath)) {
                // 验证 Python 可执行文件是否可用（使用异步方式，避免阻塞）
                try {
                    await execAsync(`"${pythonPath}" --version`, {
                        timeout: 3000,
                        env: process.env,
                        stdio: 'pipe'
                    });
                    console.log(`[PythonBridge] 找到内置 Python 环境: ${pythonPath}`);
                    return pythonPath;
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.warn(`[PythonBridge] Python 可执行文件存在但无法运行: ${pythonPath}`, errorMessage);
                    // 继续尝试下一个路径
                }
            }
            // 每检查几个路径就让出控制权，避免阻塞 UI
            if (i % 3 === 0 && i > 0) {
                await yieldToUI();
            }
        }
        catch (error) {
            // 忽略检查错误，继续尝试下一个路径
            continue;
        }
    }
    // 如果所有路径都失败，抛出明确的错误
    const searchedPaths = searchPaths.slice(0, 3).join('\n  - ');
    throw new Error(`未找到项目内置的 Python 环境。\n\n` +
        `项目应包含内置的 Python 环境，位于: python_bundle/python-3.13.9-embed/${pythonExecutableName}\n\n` +
        `已搜索的路径:\n  - ${searchedPaths}\n${searchPaths.length > 3 ? '  ...' : ''}\n\n` +
        `这可能是应用程序安装不完整的问题。请重新安装应用程序或联系技术支持。\n\n` +
        `注意: 本应用程序使用内置的独立 Python 环境，不需要用户本地安装 Python。`);
}
export class PythonBridge {
    constructor() {
        this.process = null;
        this.stdoutBuffer = ''; // 用于累积 stdout 数据
        this.isReady = false;
        this.requestQueue = [];
        this.currentRequest = null;
        this.dependencyCheckCache = null;
        this.dependencyCheckInProgress = false;
        // 不在构造函数中检测，改为在运行时动态检测
    }
    /**
     * 检测是否应该使用 IPC（运行时动态检测）
     */
    shouldUseIPC() {
        return isBrowser && getElectronIPC() !== null;
    }
    /**
     * 使用临时文件执行 Python 脚本（避免 Windows 上的换行符问题）
     */
    async executePythonScript(pythonExecutable, scriptContent, path, childProcess, fsModule) {
        // 创建临时文件
        const osModule = await new Function('specifier', 'return import(specifier)')('os');
        const tmpDir = osModule.tmpdir();
        const tmpFileName = `python_check_${Date.now()}_${Math.random().toString(36).substring(7)}.py`;
        const tmpFilePath = path.join(tmpDir, tmpFileName);
        try {
            // 写入脚本内容
            fsModule.writeFileSync(tmpFilePath, scriptContent, 'utf-8');
            // 执行脚本
            const command = `"${pythonExecutable}" "${tmpFilePath}"`;
            const result = childProcess.execSync(command, {
                stdio: 'pipe',
                timeout: 10000,
                encoding: 'utf-8',
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });
            return result.toString();
        }
        finally {
            // 清理临时文件
            try {
                if (fsModule.existsSync && fsModule.existsSync(tmpFilePath)) {
                    fsModule.unlinkSync(tmpFilePath);
                }
            }
            catch (cleanupError) {
                // 忽略清理错误
                console.warn('[PythonBridge] 清理临时文件失败:', cleanupError);
            }
        }
    }
    /**
     * 检查并安装 Python 依赖（公共方法，用于应用启动时静默后台执行）
     * 使用缓存机制，确保只检查一次
     */
    async checkAndInstallDependencies() {
        // 如果正在检查，直接返回
        if (this.dependencyCheckInProgress) {
            console.log('[PythonBridge] 依赖检查正在进行中，跳过重复检查');
            return;
        }
        // 检查缓存（24小时内只检查一次）
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时
        if (this.dependencyCheckCache) {
            const now = Date.now();
            if (this.dependencyCheckCache.checked && (now - this.dependencyCheckCache.timestamp) < CACHE_DURATION) {
                console.log('[PythonBridge] 依赖检查在缓存有效期内，跳过检查');
                return;
            }
        }
        // 尝试从 electron-store 获取缓存
        try {
            const StoreModule = await new Function('specifier', 'return import(specifier)')('electron-store');
            const { app } = await new Function('specifier', 'return import(specifier)')('electron');
            // electron-store 可能是默认导出或命名导出
            const Store = StoreModule.default || StoreModule;
            const store = new Store({
                name: 'python-dependencies',
                cwd: app.getPath('userData')
            });
            const cacheKey = 'dependency-check-cache';
            const cached = store.get(cacheKey);
            if (cached && cached.checked && (Date.now() - cached.timestamp) < CACHE_DURATION) {
                console.log('[PythonBridge] 从 electron-store 读取到有效的依赖检查缓存，跳过检查');
                this.dependencyCheckCache = cached;
                return;
            }
        }
        catch (error) {
            // 如果 electron-store 不可用，使用内存缓存
            console.log('[PythonBridge] electron-store 不可用，使用内存缓存:', error instanceof Error ? error.message : String(error));
        }
        // 标记正在检查
        this.dependencyCheckInProgress = true;
        try {
            // 静默后台执行依赖检查
            console.log('[PythonBridge] 开始静默后台检查 Python 依赖...');
            // 让出控制权给 UI
            await yieldToUI();
            const pythonExecutable = await detectPythonExecutable();
            const path = await getPathModule();
            const fsModule = await new Function('specifier', 'return import(specifier)')('fs');
            // 获取 Python 脚本路径
            let currentDir;
            if (typeof __dirname !== 'undefined') {
                currentDir = __dirname;
            }
            else {
                const { fileURLToPath } = await import('url');
                const { dirname } = await import('path');
                const __filename = fileURLToPath(import.meta.url);
                currentDir = dirname(__filename);
            }
            const pythonScriptPath = path.join(currentDir, '../../../src/python/services/server.py');
            // 执行依赖检查
            await this.ensureDependenciesInstalled(pythonExecutable, pythonScriptPath, path, await getChildProcessModule(), fsModule);
            // 更新缓存
            const cacheData = { checked: true, timestamp: Date.now() };
            this.dependencyCheckCache = cacheData;
            // 保存到 electron-store
            try {
                const StoreModule = await new Function('specifier', 'return import(specifier)')('electron-store');
                const { app } = await new Function('specifier', 'return import(specifier)')('electron');
                // electron-store 可能是默认导出或命名导出
                const Store = StoreModule.default || StoreModule;
                const store = new Store({
                    name: 'python-dependencies',
                    cwd: app.getPath('userData')
                });
                store.set('dependency-check-cache', cacheData);
                console.log('[PythonBridge] 依赖检查完成，已保存到缓存');
            }
            catch (error) {
                // 忽略 electron-store 错误
                console.log('[PythonBridge] 依赖检查完成，但无法保存到 electron-store:', error instanceof Error ? error.message : String(error));
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[PythonBridge] 静默后台依赖检查失败: ${errorMessage}`);
            // 不抛出错误，静默失败
        }
        finally {
            this.dependencyCheckInProgress = false;
        }
    }
    /**
     * 确保 Python 依赖已安装（内部方法）
     */
    async ensureDependenciesInstalled(pythonExecutable, pythonScriptPath, path, childProcess, fsModule) {
        // 查找 requirements.txt 文件（尝试多个可能的路径）
        const scriptDir = path.dirname(pythonScriptPath);
        const possiblePaths = [
            path.join(scriptDir, 'requirements.txt'), // 脚本同目录
            path.join(scriptDir, '..', 'requirements.txt'), // 上一级目录
            path.join(scriptDir, '..', '..', 'requirements.txt'), // 上两级目录
            path.join(process.cwd(), 'packages', 'global-rag', 'src', 'python', 'services', 'requirements.txt'), // 项目相对路径
            path.join(process.cwd(), 'python_bundle', 'requirements.txt'), // python_bundle 目录
        ];
        // 转换为绝对路径并去重
        const absolutePaths = possiblePaths
            .map(p => path.isAbsolute(p) ? p : path.resolve(p))
            .filter((p, index, self) => self.indexOf(p) === index);
        let requirementsPath;
        for (const testPath of absolutePaths) {
            if (fsModule.existsSync && fsModule.existsSync(testPath)) {
                requirementsPath = testPath;
                break;
            }
        }
        if (!requirementsPath) {
            console.warn(`[PythonBridge] 未找到 requirements.txt，尝试的路径:`, absolutePaths);
            // 不返回，继续尝试检查依赖是否已安装
        }
        // 检查依赖是否已安装（通过尝试导入实际需要的模块）
        try {
            // Build Python check script
            // Try new location first, fallback to old location
            const pythonCheckScript = `try:
    # Try importing from new location (langchain 0.2+)
    import langchain_text_splitters
    import langchain_core.documents
    import tiktoken
    import sentence_transformers
    import numpy
    import chromadb
    print("OK")
except ImportError:
    # Fallback to old location (langchain < 0.2)
    try:
        import langchain.text_splitter
        import langchain.schema
        import tiktoken
        import sentence_transformers
        import numpy
        import chromadb
        print("OK")
    except ImportError as e:
        print(f"IMPORT_ERROR: {e}")
        raise
`;
            const result = await this.executePythonScript(pythonExecutable, pythonCheckScript, path, childProcess, fsModule);
            if (result && result.trim() === 'OK') {
                return;
            }
            else {
                throw new Error('依赖检查未返回预期结果');
            }
        }
        catch (error) {
            // 依赖未安装或不完整，需要安装
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorOutput = error instanceof Error && 'stderr' in error
                ? error.stderr?.toString() || ''
                : '';
        }
        // 如果没有找到 requirements.txt，无法安装依赖
        if (!requirementsPath) {
            throw new Error('未找到 requirements.txt 文件，无法安装 Python 依赖');
        }
        // 获取 pip 可执行文件路径
        const pythonDir = path.dirname(pythonExecutable);
        const scriptsDir = path.join(pythonDir, 'Scripts');
        const pipExecutable = process.platform === 'win32'
            ? path.join(scriptsDir, 'pip.exe')
            : path.join(scriptsDir, 'pip');
        const pipExecutableAlt = process.platform === 'win32'
            ? path.join(scriptsDir, 'pip3.exe')
            : path.join(scriptsDir, 'pip3');
        let pipPath;
        if (fsModule.existsSync && fsModule.existsSync(pipExecutable)) {
            pipPath = pipExecutable;
        }
        else if (fsModule.existsSync && fsModule.existsSync(pipExecutableAlt)) {
            pipPath = pipExecutableAlt;
        }
        else {
            // 尝试使用 python -m pip
            pipPath = pythonExecutable;
        }
        // 先升级 pip（使用 python -m pip 更可靠）
        try {
            // 让出控制权给 UI
            await yieldToUI();
            const upgradeCommand = `"${pythonExecutable}" -m pip install --upgrade pip --quiet`;
            await execAsync(upgradeCommand, {
                timeout: 60000, // 1 分钟超时
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                },
                stdio: 'pipe'
            });
            console.log('[PythonBridge] pip 升级完成');
            // 让出控制权给 UI
            await yieldToUI();
        }
        catch (error) {
            // pip 升级失败不影响依赖安装，只记录警告
            console.warn('[PythonBridge] pip 升级失败，继续安装依赖:', error instanceof Error ? error.message : String(error));
        }
        // 安装依赖
        try {
            // 确保使用绝对路径
            const absoluteRequirementsPath = path.isAbsolute(requirementsPath)
                ? requirementsPath
                : path.resolve(requirementsPath);
            // 使用 python -m pip 更可靠，特别是在 Windows 上
            // 添加 --no-cache-dir 避免缓存问题，添加 --upgrade 确保安装最新版本
            const installCommand = `"${pythonExecutable}" -m pip install -r "${absoluteRequirementsPath}" --upgrade --no-cache-dir`;
            // 让出控制权给 UI（依赖安装可能需要较长时间）
            await yieldToUI();
            await execAsync(installCommand, {
                timeout: 600000, // 10 分钟超时（依赖安装可能需要较长时间）
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                },
                cwd: scriptDir,
                stdio: 'inherit'
            });
            console.log('[PythonBridge] Python 依赖安装完成');
            // 让出控制权给 UI
            await yieldToUI();
            // Verify dependencies after installation
            const pythonVerifyScript = `try:
    # Try importing from new location (langchain 0.2+)
    import langchain_text_splitters
    import langchain_core.documents
    import tiktoken
    import sentence_transformers
    import numpy
    import chromadb
    print("OK_NEW")
except ImportError:
    # Fallback to old location (langchain < 0.2)
    try:
        import langchain.text_splitter
        import langchain.schema
        import tiktoken
        import sentence_transformers
        import numpy
        import chromadb
        print("OK_OLD")
    except ImportError as e:
        print(f"VERIFY_ERROR: {e}")
        raise
`;
            try {
                const verifyResult = await this.executePythonScript(pythonExecutable, pythonVerifyScript, path, childProcess, fsModule);
                const verifyOutput = verifyResult.trim();
                if (verifyOutput === 'OK_NEW' || verifyOutput === 'OK_OLD') {
                    console.log('[PythonBridge] 依赖验证成功:', verifyOutput === 'OK_NEW' ? '新版本' : '旧版本');
                }
                else {
                    console.log('[PythonBridge] 依赖验证成功:', verifyOutput);
                }
            }
            catch (verifyError) {
                const verifyErrorMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
                const verifyErrorOutput = verifyError instanceof Error && 'stderr' in verifyError
                    ? verifyError.stderr?.toString() || ''
                    : '';
                console.warn(`[PythonBridge] 依赖验证失败: ${verifyErrorMsg}`);
                if (verifyErrorOutput) {
                    console.warn(`[PythonBridge] 验证错误详情: ${verifyErrorOutput}`);
                }
                console.warn('[PythonBridge] 某些依赖可能未正确安装，但将继续启动服务');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorOutput = error instanceof Error && 'stderr' in error
                ? error.stderr?.toString() || ''
                : '';
            throw new Error(`安装 Python 依赖失败: ${errorMessage}\n` +
                `requirements.txt 路径: ${requirementsPath}\n` +
                (errorOutput ? `错误输出: ${errorOutput}\n` : '') +
                `请检查 Python 环境和网络连接`);
        }
    }
    /**
     * 启动 Python 服务
     */
    async start() {
        // 运行时动态检测是否应该使用 IPC
        if (this.shouldUseIPC()) {
            const ipc = getElectronIPC();
            if (!ipc) {
                throw new Error('Electron IPC is not available in browser environment.');
            }
            try {
                const result = await ipc.invoke('python-bridge:start');
                if (result && typeof result === 'object' && 'success' in result) {
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to start Python service via IPC');
                    }
                    this.isReady = true;
                    return;
                }
            }
            catch (error) {
                throw new Error(`Failed to start Python service via IPC: ${error instanceof Error ? error.message : String(error)}`);
            }
            return;
        }
        // Node.js 环境：直接启动 Python 进程
        if (this.process) {
            return;
        }
        if (isBrowser) {
            // 在浏览器环境中，如果 IPC 不可用，尝试再次检测
            const ipc = getElectronIPC();
            if (!ipc) {
                throw new Error('PythonBridge is not supported in browser environment without Electron IPC. Please ensure the Electron preload script is loaded.');
            }
            // 如果 IPC 可用，递归调用使用 IPC 路径
            return this.start();
        }
        // 让出控制权给 UI
        await yieldToUI();
        const path = await getPathModule();
        const childProcess = await getChildProcessModule();
        const fsModule = await new Function('specifier', 'return import(specifier)')('fs');
        // 让出控制权给 UI
        await yieldToUI();
        // 获取当前文件所在目录（ESM 兼容方式）
        let currentDir;
        if (typeof __dirname !== 'undefined') {
            // CommonJS 环境
            currentDir = __dirname;
        }
        else {
            // ESM 环境，使用 import.meta.url
            const url = new URL(import.meta.url);
            // 解码 URL 编码的路径（如 %20 -> 空格）
            currentDir = decodeURIComponent(url.pathname.replace(/\/[^/]*$/, ''));
            // Windows 路径处理
            if (process.platform === 'win32' && currentDir.startsWith('/')) {
                currentDir = currentDir.slice(1);
            }
        }
        // 计算 Python 脚本路径
        // 当前目录可能是 dist/python/bridge（编译后）或 src/python/bridge（开发时）
        // 需要找到项目根目录（packages/global-rag），然后指向 src/python/services/server.py
        let pythonScriptPath;
        // 方法1: 尝试从当前目录向上查找，找到包含 src/python/services/server.py 的目录
        let searchDir = currentDir;
        for (let i = 0; i < 5; i++) {
            const testPath = path.join(searchDir, 'src', 'python', 'services', 'server.py');
            if (fsModule.existsSync && fsModule.existsSync(testPath)) {
                pythonScriptPath = testPath;
                break;
            }
            const parentDir = path.dirname(searchDir);
            if (parentDir === searchDir) {
                // 已到达根目录
                break;
            }
            searchDir = parentDir;
        }
        // 方法2: 如果方法1失败，尝试从 dist 目录计算（假设当前在 dist/python/bridge）
        if (!pythonScriptPath) {
            // 从 dist/python/bridge 向上到 packages/global-rag，然后指向 src/python/services/server.py
            const distToSrcPath = path.join(currentDir, '../../../src/python/services/server.py');
            if (fsModule.existsSync && fsModule.existsSync(distToSrcPath)) {
                pythonScriptPath = distToSrcPath;
            }
            else {
                // 方法3: 尝试相对路径（开发环境）
                const relativePath = path.join(currentDir, '../../services/server.py');
                if (fsModule.existsSync && fsModule.existsSync(relativePath)) {
                    pythonScriptPath = relativePath;
                }
                else {
                    // 如果都失败，使用默认路径（会触发错误检查）
                    pythonScriptPath = path.join(currentDir, '../../../src/python/services/server.py');
                }
            }
        }
        // 确保路径已设置
        if (!pythonScriptPath) {
            pythonScriptPath = path.join(currentDir, '../../../src/python/services/server.py');
        }
        // 让出控制权给 UI
        await yieldToUI();
        // 检测可用的 Python 可执行文件
        let pythonExecutable;
        try {
            pythonExecutable = await detectPythonExecutable();
            // 让出控制权给 UI
            await yieldToUI();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`无法启动 Python 服务: ${errorMessage}`);
        }
        // 让出控制权给 UI
        await yieldToUI();
        // 验证 Python 脚本是否存在
        try {
            if (!fsModule.existsSync || !fsModule.existsSync(pythonScriptPath)) {
                throw new Error(`Python 脚本不存在: ${pythonScriptPath}`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`无法找到 Python 脚本: ${errorMessage}\n脚本路径: ${pythonScriptPath}`);
        }
        // 让出控制权给 UI
        await yieldToUI();
        // 在启动服务之前，确保依赖已安装
        // 这可以避免服务启动时因为缺少依赖而失败
        try {
            await this.ensureDependenciesInstalled(pythonExecutable, pythonScriptPath, path, await getChildProcessModule(), fsModule);
            console.log('[PythonBridge] Python 依赖检查完成');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[PythonBridge] 依赖检查失败，但继续启动服务: ${errorMessage}`);
            // 不抛出错误，继续启动服务（依赖可能已经安装，只是检查失败）
        }
        // 监听 spawn 错误事件（ENOENT 等错误会通过这个事件触发）
        // 必须在 spawn 之前创建 Promise，确保 error 监听器能立即设置
        return new Promise((resolve, reject) => {
            // 跟踪是否已经 resolve 或 reject
            let isResolved = false;
            const errorHandler = (error) => {
                // 防止重复 reject
                if (isResolved) {
                    return;
                }
                isResolved = true;
                const errorMessage = error.message || String(error);
                console.error(`[PythonBridge] 启动 Python 进程失败:`, errorMessage);
                console.error(`[PythonBridge] Python 可执行文件: ${pythonExecutable}`);
                console.error(`[PythonBridge] Python 脚本路径: ${pythonScriptPath}`);
                console.error(`[PythonBridge] 当前工作目录: ${path.dirname(pythonScriptPath)}`);
                let friendlyMessage = `无法启动 Python 进程\n\n`;
                if (errorMessage.includes('ENOENT') || errorMessage.includes('spawn')) {
                    friendlyMessage += `错误: 找不到内置 Python 环境\n\n`;
                    friendlyMessage += `Python 可执行文件路径: ${pythonExecutable}\n`;
                    friendlyMessage += `Python 脚本路径: ${pythonScriptPath}\n\n`;
                    friendlyMessage += `可能的原因:\n`;
                    friendlyMessage += `1. 应用程序安装不完整，缺少内置 Python 环境\n`;
                    friendlyMessage += `2. Python 环境文件被意外删除或移动\n`;
                    friendlyMessage += `3. 应用程序路径不正确\n\n`;
                    friendlyMessage += `解决方案:\n`;
                    friendlyMessage += `1. 重新安装应用程序\n`;
                    friendlyMessage += `2. 检查应用程序目录是否包含 python_bundle 文件夹\n`;
                    friendlyMessage += `3. 联系技术支持\n\n`;
                    friendlyMessage += `注意: 本应用程序使用内置的独立 Python 环境，不需要用户本地安装 Python。`;
                }
                else {
                    friendlyMessage += `错误: ${errorMessage}\n`;
                    friendlyMessage += `Python 可执行文件: ${pythonExecutable}\n`;
                    friendlyMessage += `Python 脚本路径: ${pythonScriptPath}\n`;
                    friendlyMessage += `当前工作目录: ${path.dirname(pythonScriptPath)}`;
                }
                // 清理进程引用
                this.process = null;
                this.isReady = false;
                // 抛出友好的错误
                reject(new Error(friendlyMessage));
            };
            // 先创建进程，然后立即同步设置 error 监听器
            try {
                // 确保使用正确的环境变量（特别是 PATH 和编码设置）
                const spawnEnv = {
                    ...process.env,
                    // 确保 PATH 包含系统 PATH
                    PATH: process.env.PATH || (process.platform === 'win32'
                        ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32;${process.env.SystemRoot || 'C:\\Windows'};${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0`
                        : '/usr/local/bin:/usr/bin:/bin'),
                    // 确保 Python 使用 UTF-8 编码
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUNBUFFERED: '1',
                };
                this.process = childProcess.spawn(pythonExecutable, [pythonScriptPath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: path.dirname(pythonScriptPath),
                    env: spawnEnv,
                });
                const processPid = this.process.pid ?? 'unknown';
                // 立即同步设置 error 监听器（必须在下一个事件循环之前）
                this.process.on('error', errorHandler);
            }
            catch (spawnError) {
                const errorMessage = spawnError instanceof Error ? spawnError.message : String(spawnError);
                reject(new Error(`启动 Python 进程失败: ${errorMessage}\n` +
                    `Python 可执行文件: ${pythonExecutable}\n` +
                    `Python 脚本路径: ${pythonScriptPath}`));
                return;
            }
            // 收集 stderr 输出用于错误诊断
            const stderrBuffer = [];
            // 重置 stdout 缓冲区
            this.stdoutBuffer = '';
            // 监听 stdout 数据
            this.process.stdout?.on('data', (data) => {
                // 累积数据到缓冲区，明确使用 UTF-8 编码
                this.stdoutBuffer += data.toString('utf-8');
                // 按行处理数据
                const lines = this.stdoutBuffer.split('\n');
                // 保留最后一行（可能不完整）
                this.stdoutBuffer = lines.pop() || '';
                // 处理完整的行
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) {
                        continue; // 跳过空行
                    }
                    // 尝试解析 JSON
                    // 注意：Python 端已经做了 sanitize，所以这里应该能直接解析
                    try {
                        // 只处理看起来像 JSON 的行（以 { 开头）
                        if (!trimmedLine.startsWith('{')) {
                            // 如果不是 JSON 格式，可能是 Python 的调试输出
                            // 过滤掉常见的警告信息（如 jq package not found），不输出到控制台
                            const isCommonWarning = trimmedLine.includes('jq package not found') ||
                                trimmedLine.includes('FileParserService') ||
                                trimmedLine.includes('JSONLoader') ||
                                trimmedLine.includes('TextLoader');
                            // 只输出非常见警告的调试信息（如果需要调试，可以取消注释）
                            // if (!isCommonWarning) {
                            //   console.debug('[PythonBridge] 非 JSON 输出:', trimmedLine.substring(0, 200));
                            // }
                            continue;
                        }
                        // 直接解析 JSON（Python 端已经做了 sanitize）
                        const response = JSON.parse(trimmedLine);
                        // 清理响应中的文本数据，确保编码正确
                        if (response.result && Array.isArray(response.result)) {
                            response.result = this.cleanSearchResults(response.result);
                        }
                        if (this.currentRequest) {
                            this.currentRequest.resolve(response);
                            this.currentRequest = null;
                            this.processNextRequest();
                        }
                    }
                    catch (error) {
                        // 如果解析失败，说明 Python 端的 sanitize 可能有问题
                        // 只有在有当前请求时才处理错误
                        if (this.currentRequest) {
                            const parseError = error instanceof Error ? error.message : String(error);
                            console.error('[PythonBridge] JSON 解析失败:', parseError);
                            // 记录更多调试信息
                            const responseLength = trimmedLine.length;
                            const previewLength = Math.min(500, responseLength);
                            console.error('[PythonBridge] 响应长度:', responseLength);
                            console.error('[PythonBridge] 原始响应前', previewLength, '字符:', trimmedLine.substring(0, previewLength));
                            // 如果响应很长，也记录后500字符
                            if (responseLength > 1000) {
                                console.error('[PythonBridge] 原始响应后500字符:', trimmedLine.substring(responseLength - 500));
                            }
                            // 尝试从响应中提取错误信息（即使 JSON 无效）
                            // 使用更宽松的正则表达式来匹配错误信息
                            const errorMatch = trimmedLine.match(/"error"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                            if (errorMatch) {
                                let errorMessage = errorMatch[1];
                                // 清理错误消息中的转义序列
                                errorMessage = errorMessage.replace(/\\(.)/g, '$1');
                                this.currentRequest.reject(new Error(`Python service error: ${errorMessage} (possibly caused by special characters in text content)`));
                            }
                            else {
                                // 如果无法提取错误信息，返回更详细的解析错误
                                const detailedError = `Invalid JSON: ${parseError}`;
                                this.currentRequest.reject(new Error(`${detailedError} (possibly caused by special characters in text content)`));
                            }
                            this.currentRequest = null;
                            this.processNextRequest();
                        }
                    }
                }
            });
            this.process.stderr?.on('data', (data) => {
                const errorOutput = data.toString();
                stderrBuffer.push(errorOutput);
                console.error('Python service error:', errorOutput);
            });
            this.process.on('exit', (code, signal) => {
                this.process = null;
                this.isReady = false;
                // 如果进程在启动阶段退出，reject start Promise
                if (!isResolved) {
                    isResolved = true;
                    const stderrOutput = stderrBuffer.join('').trim();
                    let exitMessage;
                    if (signal) {
                        exitMessage = `Python 进程被信号 ${signal} 终止`;
                    }
                    else {
                        exitMessage = `Python 进程退出，退出码: ${code}`;
                    }
                    // 如果有 stderr 输出，添加到错误消息中
                    if (stderrOutput) {
                        exitMessage += `\n\n错误输出:\n${stderrOutput}`;
                    }
                    // 为退出码 1 提供更详细的诊断信息
                    if (code === 1) {
                        exitMessage += `\n\n可能的原因:\n`;
                        exitMessage += `1. Python 脚本语法错误或运行时错误\n`;
                        exitMessage += `2. 缺少必要的 Python 依赖包\n`;
                        exitMessage += `3. Python 环境文件损坏或不完整\n`;
                        exitMessage += `4. 文件权限问题\n\n`;
                        exitMessage += `解决方案:\n`;
                        exitMessage += `1. 检查应用程序目录是否包含完整的 python_bundle 文件夹\n`;
                        exitMessage += `2. 重新安装应用程序\n`;
                        exitMessage += `3. 查看上方的错误输出以获取更多信息\n`;
                        exitMessage += `4. 联系技术支持并提供错误输出信息\n\n`;
                        exitMessage += `注意: 本应用程序使用内置的独立 Python 环境，不需要用户本地安装 Python。`;
                    }
                    reject(new Error(exitMessage));
                }
                if (this.currentRequest) {
                    this.currentRequest.reject(new Error(`Python process exited with code ${code}`));
                    this.currentRequest = null;
                }
                // 拒绝所有待处理的请求
                this.requestQueue.forEach(({ reject }) => {
                    reject(new Error('Python process exited'));
                });
                this.requestQueue = [];
            });
            // 如果进程没有立即出错，认为启动成功
            // 使用 setTimeout 确保 error 事件有时间触发（如果会触发的话）
            setTimeout(() => {
                // 检查进程是否仍然存在且没有出错
                if (!isResolved && this.process && !this.process.killed) {
                    isResolved = true;
                    this.isReady = true;
                    resolve();
                }
                else if (!isResolved && (!this.process || this.process.killed)) {
                    // 进程已经退出或被杀死，但 exit 事件可能还没触发
                    isResolved = true;
                    reject(new Error('Python 进程启动失败：进程已退出'));
                }
            }, 100);
        });
    }
    /**
     * 停止 Python 服务
     */
    async stop() {
        // 运行时动态检测是否应该使用 IPC
        if (this.shouldUseIPC()) {
            const ipc = getElectronIPC();
            if (ipc) {
                try {
                    await ipc.invoke('python-bridge:stop');
                }
                catch (error) {
                    console.error('Failed to stop Python service via IPC:', error);
                }
            }
            this.isReady = false;
            return;
        }
        // Node.js 环境：直接停止 Python 进程
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.isReady = false;
        }
    }
    /**
     * 发送请求到 Python 服务
     */
    async request(req) {
        // 运行时动态检测是否应该使用 IPC
        if (this.shouldUseIPC()) {
            const ipc = getElectronIPC();
            if (!ipc) {
                throw new Error('Electron IPC is not available in browser environment.');
            }
            // 确保服务已启动
            if (!this.isReady) {
                await this.start();
            }
            try {
                const result = await ipc.invoke('python-bridge:request', req);
                if (result && typeof result === 'object') {
                    return result;
                }
                throw new Error('Invalid response from IPC');
            }
            catch (error) {
                throw new Error(`Failed to send request via IPC: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        // Node.js 环境：直接发送请求到 Python 进程
        if (!this.isReady || !this.process) {
            await this.start();
        }
        return new Promise((resolve, reject) => {
            if (this.currentRequest) {
                // 如果当前有请求在处理，加入队列
                this.requestQueue.push({ request: req, resolve, reject });
            }
            else {
                this.sendRequest(req, resolve, reject);
            }
        });
    }
    /**
     * 发送请求
     */
    sendRequest(req, resolve, reject) {
        if (!this.process || !this.process.stdin) {
            reject(new Error('Python process is not available'));
            return;
        }
        this.currentRequest = { resolve, reject };
        try {
            // 对请求进行安全的JSON序列化
            // 先清理请求数据，确保没有无效的转义序列和控制字符
            const sanitizedReq = this.sanitizeRequestForJSON(req);
            // 尝试序列化，如果失败则提供更详细的错误信息
            let requestJson;
            try {
                requestJson = JSON.stringify(sanitizedReq);
                // 验证 JSON 是否有效（在添加换行符之前）
                try {
                    JSON.parse(requestJson);
                }
                catch (parseError) {
                    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                    console.error('[PythonBridge] 生成的 JSON 无效（添加换行符前）:', errorMessage);
                    console.error('[PythonBridge] JSON 前 500 字符:', requestJson.substring(0, 500));
                    console.error('[PythonBridge] JSON 长度:', requestJson.length);
                    // 检查是否是文本内容导致的问题
                    const params = sanitizedReq.params;
                    if (params) {
                        if (typeof params.text === 'string') {
                            const textLength = params.text.length;
                            const textPreview = params.text.substring(0, 200);
                            console.error('[PythonBridge] 文本长度:', textLength);
                            console.error('[PythonBridge] 文本预览:', textPreview);
                        }
                        if (Array.isArray(params.file_paths)) {
                            console.error('[PythonBridge] 文件路径数量:', params.file_paths.length);
                            console.error('[PythonBridge] 文件路径预览:', params.file_paths.slice(0, 3));
                        }
                    }
                    throw new Error(`生成的 JSON 无效: ${errorMessage}`);
                }
                // 添加换行符（Python 端按行读取）
                requestJson += '\n';
            }
            catch (stringifyError) {
                const errorMessage = stringifyError instanceof Error ? stringifyError.message : String(stringifyError);
                console.error('[PythonBridge] JSON 序列化失败:', errorMessage);
                // 检查是否是文本内容导致的问题
                const params = sanitizedReq.params;
                if (params && typeof params.text === 'string') {
                    const textLength = params.text.length;
                    const textPreview = params.text.substring(0, 200);
                    console.error('[PythonBridge] 文本长度:', textLength);
                    console.error('[PythonBridge] 文本预览:', textPreview);
                    console.error('[PythonBridge] 文本中可能包含导致 JSON 序列化失败的特殊字符');
                }
                throw new Error(`JSON 序列化失败: ${errorMessage}`);
            }
            // 记录请求信息（仅在开发模式下）
            if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
                console.debug('[PythonBridge] 发送请求:', {
                    method: sanitizedReq.method,
                    paramsKeys: Object.keys(sanitizedReq.params || {}),
                    jsonLength: requestJson.length,
                });
            }
            // 确保 stdin 可写
            if (!this.process.stdin.writable) {
                throw new Error('Python process stdin is not writable');
            }
            // 写入请求（使用 UTF-8 编码）
            this.process.stdin.write(requestJson, 'utf8', (error) => {
                if (error) {
                    console.error('[PythonBridge] 写入 stdin 失败:', error);
                    this.currentRequest?.reject(new Error(`Failed to write to stdin: ${error.message}`));
                    this.currentRequest = null;
                    this.processNextRequest();
                }
            });
        }
        catch (error) {
            this.currentRequest = null;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[PythonBridge] 发送请求失败:', errorMessage);
            // 尝试记录请求的部分内容（避免记录过大的内容）
            try {
                const reqPreview = JSON.stringify(req, null, 2).substring(0, 1000);
                console.error('[PythonBridge] 请求内容预览:', reqPreview);
            }
            catch {
                // 忽略序列化错误
            }
            reject(new Error(`Failed to send request: ${errorMessage}`));
            this.processNextRequest();
        }
    }
    /**
     * 清理请求对象，处理可能导致JSON序列化失败的内容
     * 注意：这个方法不应该手动转义，因为 JSON.stringify 会自动处理
     * 但我们需要确保字符串中没有无效的转义序列和控制字符
     */
    sanitizeRequestForJSON(req) {
        const sanitizeValue = (value) => {
            if (typeof value === 'string') {
                // 移除可能导致 JSON 解析失败的控制字符
                // 保留常见的转义字符：\n (0x0A), \r (0x0D), \t (0x09)
                // 移除其他控制字符：\u0000-\u0008, \u000B, \u000C, \u000E-\u001F, \u007F-\u009F
                let sanitized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
                // 移除零宽字符（可能导致 JSON 解析问题）
                sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
                // 修复无效的转义序列
                // 在字符串字面量中，如果用户输入了类似 \e 这样的无效转义序列
                // JSON.stringify 会将其转换为 \\e，这是有效的 JSON
                // 但为了确保兼容性，我们将无效的转义序列中的反斜杠转义
                // 有效转义字符：\n, \r, \t, \b, \f, \", \\, \/, \uXXXX, \xXX
                sanitized = sanitized.replace(/\\(?![\\/bfnrt"ux0-9a-fA-F])/g, '\\\\');
                // 修复 \x 后面没有有效十六进制字符的情况
                sanitized = sanitized.replace(/\\x(?![0-9a-fA-F]{2})/g, '\\\\x');
                // 修复 \u 后面没有有效十六进制字符的情况
                sanitized = sanitized.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
                return sanitized;
            }
            else if (Array.isArray(value)) {
                return value.map(sanitizeValue);
            }
            else if (value && typeof value === 'object') {
                const sanitized = {};
                for (const [key, val] of Object.entries(value)) {
                    sanitized[key] = sanitizeValue(val);
                }
                return sanitized;
            }
            return value;
        };
        return sanitizeValue(req);
    }
    /**
     * 处理下一个请求
     */
    /**
     * 清理搜索结果中的文本数据，确保编码正确
     */
    cleanSearchResults(results) {
        if (!Array.isArray(results)) {
            return results;
        }
        return results.map((result) => {
            if (typeof result !== 'object' || result === null) {
                return result;
            }
            const cleaned = { ...result };
            // 清理 text 字段
            if (typeof cleaned.text === 'string') {
                try {
                    // 移除无效的 Unicode 字符
                    cleaned.text = cleaned.text
                        .replace(/\uFFFD/g, '') // 移除替换字符
                        .replace(/[\uD800-\uDFFF]/g, '') // 移除孤立的代理对字符
                        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ''); // 移除控制字符（保留换行、制表符等）
                }
                catch (error) {
                    console.warn('[PythonBridge] 清理文本字段时出错:', error);
                }
            }
            // 清理 metadata 中的字符串字段
            if (cleaned.metadata && typeof cleaned.metadata === 'object') {
                const cleanedMetadata = {};
                for (const [key, value] of Object.entries(cleaned.metadata)) {
                    if (typeof value === 'string') {
                        try {
                            cleanedMetadata[key] = value
                                .replace(/\uFFFD/g, '')
                                .replace(/[\uD800-\uDFFF]/g, '')
                                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
                        }
                        catch (error) {
                            cleanedMetadata[key] = value;
                        }
                    }
                    else {
                        cleanedMetadata[key] = value;
                    }
                }
                cleaned.metadata = cleanedMetadata;
            }
            return cleaned;
        });
    }
    processNextRequest() {
        if (this.requestQueue.length > 0 && !this.currentRequest) {
            const { request, resolve, reject } = this.requestQueue.shift();
            this.sendRequest(request, resolve, reject);
        }
    }
    /**
     * 检查服务是否就绪
     */
    isServiceReady() {
        // 运行时动态检测是否应该使用 IPC
        if (this.shouldUseIPC()) {
            return this.isReady;
        }
        // Node.js 环境：检查进程状态
        return this.isReady && this.process !== null;
    }
}
//# sourceMappingURL=PythonBridge.js.map