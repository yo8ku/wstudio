/**
 * Electron 婵炴垶鎸诲Σ鎺旀崲濡偐鐭欓悗锝庝簼閸庢瑩鏌涢弬璇插闁哄鍟撮弫?
 */

const { app, BrowserWindow, ipcMain, protocol, dialog, session, shell, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');
const http = require('http');
const { fileURLToPath } = require('url');

// 閻庢鍠掗崑鎾绘煕濞嗘劕鐏﹂懚鈺冣偓娈垮枛缁诲绮崨顖滅焿濞达絿鍎ら弳蹇涙倵閻熼偊妲搁柛娆忕箳閹峰啴鏁冮埀顒勫箟閿熺姵鏅柛顐犲灪閺呯霉濠х姴濯担鍓插殨闊洤娴烽悷鎾趁归崗闂翠孩闁搞倖绮撳畷婵嬪Ω閵夛箑鍓婚梺姹囧焺閻撳妲?
// 濠电偛顦崝宥夊礈娴煎瓨鏅慨妯虹－缁犵懓鈽夐幘宕囆＄紒鍙樺嵆濮婅棄顓奸崟顓犘ｉ柣搴ｆ嚀椤︻垶宕ｈ箛娑樼畱鐟滄繄妲愬┑瀣倞闁绘绮剧粈?CSP 婵炲濮寸粔鍫曞礉瑜旈弻鍛潩瀹曞洨鐣?HTTP 闂佸憡绻傜粔瀵歌姳閸欏绶為柡澶嬪灦鐎?meta 闂佸搫绉村ú銊╊敆妞嬪孩濯奸柛鎾楀懏鐎?
// 闁荤姭鍋撻柨鏇楀亾闁硅绻濆鐢割敆閸愵喚鍙愰柣鐘叉搐閻°劌危?"This warning will not show up once the app is packaged"
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// 闁荤姳绀佹晶浠嬫偪閸℃あ鐔煎灳閾忣偄浠撮柣鐔哥懕缁查箖鎮楅悾灞惧磯妞ゆ牗姘ㄧ粣鐐烘煥濞戞瀚伴柣?@note-studio 闂佸搫瀚慨鎾儍閻樼粯鏅?packages 闂佺儵鏅╅崰鏍礊?
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain) {
  if (request.startsWith('@note-studio/')) {
    const pkgName = request.replace('@note-studio/', '');
    const pkgPath = path.join(__dirname, 'packages', pkgName.split('/')[0]);
    if (fs.existsSync(pkgPath)) {
      return originalResolveFilename.call(this, pkgPath, parent, isMain);
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain);
};

const { initializeExtensions, pluginManager, settingsManager, workspaceManager, builtinAI } = require('./packages/main/dist/main/src/index.js');
const { ThemeService } = require('./packages/main/dist/main/src/services/ThemeService.js');
const { registerSettingsHandlers } = require('./packages/main/dist/main/src/ipc/settingsHandlers.js');
// 闁诲海鏁搁崢褔宕ｉ崱娆戠＜闁割偁鍩勬导鍌炴煛閸繄孝濠殿喚鍠栭幆鍕矙閸喖缍樺┑鈽嗗灙閳ь剝娅曢崑?
const { TerminalService } = require('./packages/main/dist/main/src/services/terminal/index.js');
const { setTerminalService } = require('./packages/main/dist/main/src/ipc/terminalHandlers.js');
// 婵炲瓨绮嶉崹褰掝敂?Embedding 闂佸搫鐗嗙粔瀛樻叏?
const { cloudEmbeddingService } = require('./packages/main/dist/main/src/services/CloudEmbeddingService.js');
const { getAllEmbeddingProviders, getEnabledEmbeddingModels } = require('./packages/main/dist/main/src/services/EmbeddingModelConfig.js');
// 閻庤鎮堕崕鎵礊閺冨牆绀岄柛婵嗗閸婂姊洪幓鎺旂闁稿被鍔岄锝夊即閻斿摜鐤€闂?
const { workspaceVectorIndexService } = require('./packages/main/dist/main/src/services/WorkspaceVectorIndexService.js');

const logIconPath = path.join(__dirname, 'log', 'log.png');
const DEV_SERVER_URL = 'http://127.0.0.1:5173';
const DEV_SERVER_MAX_RETRIES = 8;
const DEV_SERVER_RETRY_DELAY_MS = 750;
if (!fs.existsSync(logIconPath)) {
  console.warn('[Electron] 闁圭厧鐡ㄥ濠氬极閵堝鐐婇柣鎰靛墰閸ㄥジ鏌￠崼顐＄凹濠㈣锕㈠畷姘辨暜椤斿墽顦俊顐ｆ緲鐎氼垶顢橀崫銉﹀磯妞ゆ牗姘ㄧ粣?', logIconPath);
}

// 婵帗绋掗…鍫ヮ敇婵犳艾瑙︽い鏍ㄧ矋閺嗗繒鐥褍鍘告繛鍡愬灲瀹曟繈鎮╅悜鈺佷壕闁绘洖鍊荤粈澶愭⒑椤掆偓閻忔繈宕?Windows frameless 缂備焦鍔栭〃鍛般亹濞戙垺鏅?resize 闂佸搫鍟冲▔娑㈠吹椤撱垺鍋濆ù鐓庮嚟閹枫劑骞栫€涙ɑ绀夐挊鐔兼偨椤栧棗绉电€?
// 婵犵鈧啿鈧灝銆掗崼鏇炵闁圭儤鎸鹃崣鈧?GPU 闂佺绻掗崢褔顢欓幇鐗堚拻妞ゆ洍鍋撴い锝勭矙閺佸秶浠﹂挊澶庮唹闂備緡鍋呮穱铏规崲閸愵喗鍋濇い鏍ㄥ嚬閺嗘棃鏌涘▎鎰惰€块柛锝呮惈椤曪綁宕崟顐ゅ幀闂佺绻戞繛濠偽涢幘顔芥櫢?
if (process.env.NOTE_STUDIO_DISABLE_HARDWARE_ACCELERATION === 'true') {
  app.disableHardwareAcceleration();
  console.log('[Electron] Hardware acceleration disabled via env flag.');
} else {
  console.log('[Electron] Hardware acceleration remains enabled.');
}

// 濠电偛顦崝宀勫船娴犲鍤婃い蹇撳閺嗘澘鈽夐弬娆炬Ц鐎规洘顨堥幏瀣敊閺勫繒顦伴梺缁橆殙椤顭囬崼銉ョ闊洦鍑归崬鎾煥濞戞澧曠紒鐑╁亾婵＄偑鍊涢褍锕?app.whenReady 婵炴垶鏌ㄩ鍛櫠閻樺灚瀚柛鎰典簼閺嗗繘鏌?
// 闁哄鏅滈悷锕傛偋?local-file:// 闂佸憡顨呯换妤咁敊閸涙潙绠ョ€广儱鐗嗛崢鎾煥?<video>闂?audio>闂?img> 缂備焦绋戦ˇ浼存偉閿濆洨椹抽柛娆嶅劥閸橆剚鎱ㄥ┑鎾跺埌闁绘牞鍩栭幏鍛崉閵婏附娈?
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  },
  {
    scheme: 'vscode-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
]);
console.log('[Electron] Custom protocols registered.');

let mainWindow;
let terminalService = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDevServerWithRetry(targetWindow, targetUrl = DEV_SERVER_URL, attempt = 1) {
  try {
    await targetWindow.loadURL(targetUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetriable = /ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_ABORTED/i.test(errorMessage);

    if (!isRetriable || attempt >= DEV_SERVER_MAX_RETRIES || !targetWindow || targetWindow.isDestroyed()) {
      console.error('[Electron] 閻庢鍠掗崑鎾绘煕濞嗘劕鐏︽繝鈧崶顒€绀夐柍銉ㄦ珪閻濄倝鏌涢弮鍌毿繛鏉戞处瀵板嫭娼忛銉?', errorMessage);
      throw error;
    }

    console.warn(`[Electron] 閻庢鍠掗崑鎾绘煕濞嗘劕鐏︽繝鈧崶顒€绀夐柍銉ㄦ珪閻濄倝鏌￠崱妤€鈧绮径鎰煑妞ゆ牗绮嶉弳蹇涙煥濞戞鐏辨い?${attempt} 濠电偛妫寸换婵嬪闯閹间焦鏅? ${errorMessage}`);
    await sleep(DEV_SERVER_RETRY_DELAY_MS);
    await loadDevServerWithRetry(targetWindow, targetUrl, attempt + 1);
  }
}

function clampColorChannel(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(color) {
  const hex = color.replace('#', '').trim();
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }

  const normalizedHex = hex.length <= 4
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const hasAlpha = normalizedHex.length === 8;
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const alpha = hasAlpha ? Number.parseInt(normalizedHex.slice(6, 8), 16) / 255 : 1;

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }

  return { red, green, blue, alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 };
}

function parseRgbColor(color) {
  const match = color.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([0-9.]+))?\s*\)$/i
  );

  if (!match) {
    return null;
  }

  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  return {
    red: clampColorChannel(Number.parseFloat(match[1])),
    green: clampColorChannel(Number.parseFloat(match[2])),
    blue: clampColorChannel(Number.parseFloat(match[3])),
    alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
  };
}

function parseColor(color) {
  const normalizedColor = typeof color === 'string' ? color.trim().toLowerCase() : '';
  if (!normalizedColor || normalizedColor === 'transparent') {
    return null;
  }

  if (normalizedColor.startsWith('#')) {
    return parseHexColor(normalizedColor);
  }

  if (normalizedColor.startsWith('rgb')) {
    return parseRgbColor(normalizedColor);
  }

  return null;
}

function toOpaqueHex(color, fallbackColor = '#1e1e1e') {
  const fallback = parseColor(fallbackColor) || { red: 30, green: 30, blue: 30, alpha: 1 };
  const parsed = parseColor(color);
  const source = parsed || fallback;
  const alpha = Math.max(0, Math.min(1, source.alpha ?? 1));
  const red = clampColorChannel(source.red * alpha + fallback.red * (1 - alpha));
  const green = clampColorChannel(source.green * alpha + fallback.green * (1 - alpha));
  const blue = clampColorChannel(source.blue * alpha + fallback.blue * (1 - alpha));

  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}

function getThemeBackgroundColor(theme) {
  const isLightTheme = theme?.type === 'light' || theme?.type === 'hcLight';
  const fallbackColor = isLightTheme ? '#ffffff' : '#1e1e1e';
  const backgroundColor = theme?.colors?.['editor.background']
    || theme?.colors?.['sideBar.background']
    || fallbackColor;

  return toOpaqueHex(backgroundColor, fallbackColor);
}

async function resolveInitialWindowBackgroundColor() {
  try {
    const themeService = ThemeService.getInstance();
    const currentTheme = await themeService.getCurrentTheme();
    return getThemeBackgroundColor(currentTheme);
  } catch (error) {
    console.warn('[Electron] Failed to resolve initial theme background color:', error);
    return '#1e1e1e';
  }
}

/**
 * 闂佸憡甯楃粙鎴犵磽閹惧鈻旈柤濮愬€楀畷鍫曟煥?
 * @param {string} backgroundColor - 缂備焦鍔栭〃鍛般亹濞戙垺鍤勯悘鐐靛亾閻濐垶鏌ょ涵鍜佸殝缂佽鲸鐟╁鍫曞Ψ閵娿儲顔囬悷婊呭閹稿憡鏅堕悩宕団枖濠电姵鍑归弳顖炴煥?
 */
function createWindow(backgroundColor = '#1e1e1e') {
  const createdWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    minWidth: 300,
    minHeight: 600,
    frame: false, // 闂佸搫鍟版慨鍓х博閻斿娴栭柛鈩冪懅瀹曞爼鏌?
    titleBarStyle: 'hidden',
    frame: true,
    backgroundColor: backgroundColor, // 婵炶揪缍€濞夋洟寮妶鍡欌枖濠电姵鍑归弳顖炴煠閸愬弶婀版繛鍛懇閹虫繄鎷犺缁€澶愭⒑椤掆偓閻忔繈宕㈤妶澶嬪剬闁稿﹦鍠庨ˉ蹇涙⒒閸屻倓绨介柛?
    icon: logIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true, // 闂佸憡鍑归崹鎶藉极?webview 闂佸搫绉村ú銊╊敆閻戣姤鏅€光偓閳ь剟寮妶鍡欘洸閹艰揪绱曢妶鐢告煕韫囧鍔ユい顐㈩儐閿涙劙骞嬮悙鏉戝晩闂佽　鍋撻柟顖嗗嫮褰?
      backgroundThrottling: false // 缂備礁鍊烽懗鍫曞极閵堝瑙﹂幖绮光偓鎶藉彙闂佺厧鎼崐鍦矈閿曞倹鏅€光偓閳ь剟鍨惧Ο鑽も攳婵犻潧鐗忛惌鎺旂磼閺冩垵鐏犻柛妯荤矒瀵粙宕堕渚婄础闂佺粯鍨抽悞锕傤敆濠婂牊鏅?
    }
  });

  mainWindow = createdWindow;

  createdWindow.once('ready-to-show', () => {
    if (!createdWindow.isDestroyed()) {
      createdWindow.show();
    }
  });

  // 閻庢鍠掗崑鎾绘煕濞嗘劕鐏﹂懚鈺冣偓娈垮枛妤犲繒妲愭导鏉戠闁绘鍎ょ粊?Vite 閻庢鍠掗崑鎾绘煕濞嗘劕鐏︽繝鈧崶顒€绀夐柍銉ㄦ珪閻?
  let resizeStateResetTimer = null;
  const emitResizeState = (isResizing) => {
    if (createdWindow.isDestroyed()) {
      return;
    }

    const { webContents } = createdWindow;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }

    webContents.send('window:resize-state-changed', isResizing);
  };

  const scheduleResizeStateReset = () => {
    if (resizeStateResetTimer) {
      clearTimeout(resizeStateResetTimer);
    }

    resizeStateResetTimer = setTimeout(() => {
      resizeStateResetTimer = null;
      emitResizeState(false);
    }, 180);
  };

  createdWindow.on('will-resize', () => {
    emitResizeState(true);
    scheduleResizeStateReset();
  });

  createdWindow.on('resize', () => {
    emitResizeState(true);
    scheduleResizeStateReset();
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Electron] 閻庢鍠掗崑鎾绘煕濞嗘劕鐏﹂懚鈺冣偓娈垮枛妤犲繒妲愭导鏉戠闁绘鍎ょ粊?Vite 閻庢鍠掗崑鎾绘煕濞嗘劕鐏︽繝鈧崶顒€绀夐柍銉ㄦ珪閻?${DEV_SERVER_URL}`);
    void loadDevServerWithRetry(createdWindow, DEV_SERVER_URL);
    createdWindow.webContents.openDevTools();
  } else {
    // 闂佹眹鍨婚崰宥嗩殽閸ヮ灛鐔煎灳瀹曞洨顢呴梺鎸庣⊕閼圭偓鎱ㄩ悙瀛樺闁兼亽鍎抽埀顒夊灠椤曟瑩宕崟顒€鈧敻鏌ｉ妸銉ヮ仾闁哄鍟撮弫?
    console.log('[Electron] Production mode: loading built renderer files.');
    createdWindow.loadFile(path.join(__dirname, 'packages/renderer/dist/index.html'));
  }

  createdWindow.on('closed', () => {

    if (resizeStateResetTimer) {
      clearTimeout(resizeStateResetTimer);
      resizeStateResetTimer = null;
    }

    if (mainWindow === createdWindow) {
      const fallbackWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) || null;
      mainWindow = fallbackWindow;
      workspaceVectorIndexService.setMainWindow(fallbackWindow);
    }
    // 濠电偞鎸搁幊妯衡枍鎼淬劌瑙﹂柟杈剧畱濞呫倗绱掓笟鍨仼缂佹墎鏅犲闈涱吋閸涱収娼抽梺姹囧妼鐎氼噣鎮伴妷鈺佺煑闁挎繂鎳愮粚鍧楁煥?
    
  });

  // 闁荤姳绀佹晶浠嬫偪閸℃稑瑙﹂柟杈剧畱濞呫倗绱掓笟鍨仼缂佹墎鏅犲闈涱吋閸涱収娼抽梺姹囧妼鐎氼亞鈧潧鐬肩划锝呂旈埀顒冦亹濞戞﹩鍤曢柡鍥╁У閺嗗繘鏌ㄥ☉妯煎ⅱ闁轰降鍊栫粋宥嗘償閳ュ磭宀涢梻渚囧亗濞村洨鎹㈠Ο缁樺劅闁挎棁娉曢惃鎴澝归悩渚晣缂?
  workspaceVectorIndexService.setMainWindow(createdWindow);

  // F12 闂傚倸鎳庣换鎴濐渻閸岀偛绠ラ柟鎯х－绾?DevTools闂佹寧绋戦悧濠囧蓟閻斿摜鐟归柤鎰佸灣濞堝爼鎮归崶銊︾┛缂?
  createdWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') {
      createdWindow.webContents.toggleDevTools();
    }
  });

  // 闂佺儵鏅滈崹鐢稿箚婢跺鈧帡宕ｆ径灞藉脯闁哄鏅滅粙鎾诲煝閻撳海鏆﹂柍鍝勫€婚惃?
  createdWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] 濠电偞鎸稿鍫曟偂鐎ｎ偅浜ゆ繛鎴炲焹閺屻倗鈧娲嶉弲婊呰姳?', details.reason, details.exitCode);
  });
  createdWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) { // warning=2, error=3
      console.error(`[Renderer] ${message} (${sourceId}:${line})`);
    }
  });
  
  // 闂佺儵鏅滈崹鐢稿箚婢跺瞼鐜绘俊銈傚亾鐟滅増鐩幃鐐烘晜閹傚寲闂佸憡鐟﹂敋閻?
  createdWindow.on('focus', () => {
    createdWindow.webContents.send('window-focus');
  });
  
  createdWindow.on('blur', () => {
    createdWindow.webContents.send('window-blur');
  });
  
  // 缂備焦鍔栭〃鍛般亹濞戙垹绀夐柣妯煎劋缁佷即鎮楅悷鐗堟拱闁搞劍宀稿畷銉︽償閿濆棛鏆犳繝銏ｆ硾鐎氼噣骞?
  createdWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Renderer did-finish-load.');
    // 濠电偛顦崝宥夊礈娴煎瓨鏅慨婵堟晿in-process:ready 婵炲瓨绮岄鍕枎閵忋倖鏅?initializeExtensions 闁诲海鎳撻張顒勫垂濮樿泛瑙﹂幖绮光偓宕囧矝闂備緡鍋傜欢銈囨濠靛洨鈻旂€广儱鎳忛煬顒勫级閳哄倻鎳囬柛锝囧厴瀹曪綁骞嬮娑橆伓?
  });

  return createdWindow;
}

/**
 * 闁圭厧鐡ㄥ濠氬极閵堝洨鐭欓悗锝庝簽绾板秹鎮樿箛姘惈闁告閰ｅ畷銉︽償閳ュ磭浠存繝娈垮枛椤戝懐鈧?
 */
app.whenReady().then(async () => {
  
  // 闁荤姳绀佹晶浠嬫偪閸℃ɑ鍎熼柡鍐ㄥ€归弳蹇涙煠閹稿海鐭婄€规洜鍠栭弫宥囦沪閼恒儱鍓婚梺娲绘娇閸斿秹鎮ラ敐澶婄闁糕剝鐟у浠嬪级閸喎鐏ラ柟鐑╂櫊楠炴垿鎮滈懞銉︽闂佹寧绋戝﹢鎲坮l+X/C/V/A/Z闂?
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', label: 'Redo', accelerator: 'CmdOrCtrl+Y' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', label: 'Paste', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', label: 'Select All', accelerator: 'CmdOrCtrl+A' },
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  console.log('[Electron] Application menu initialized.');
  
  // 闂佺绻堥崝宀勬儑椤掑倹濯奸柛鎾楀懏鐎?Content Security Policy (CSP)
  // 闂婎偄娲ら幊姗€濡磋箛娑樻嵍闁靛鍎遍悘锛勨偓鐐瑰€涘▍锝夋偘閵夆晛鐭楅柨婵嗗椤撴椽鏌涢幘宕囆ユい鏃€娲滅槐鏃堫敋閸℃瑧顦繛瀵稿О閸庢娊鍨惧Ο鑽も攳婵犻潧娲ら。鏌ユ煛閸繍妲兼い鏇ㄥ墮鏁堥柛宀€鍋涢崢鎾箹鐎涙ɑ鈷掗柡?CSP
  const defaultSession = session.defaultSession;
  
  // 闁诲氦顫夐惌顔剧不?CSP 缂備焦绋掗悧婊堝汲?
  // 濠电偛顦崝宥夊礈娴煎瓨鏅慨妯荤樂閳哄懏鏅?unsafe-eval 闂佸憡鐟崹鐢稿礂濡顕辨慨姗嗗墮椤ㄦ盯鏌?Vite HMR闂佹寧绋戦懟顖炪€呰瀵顭ㄩ崼婊勬崳闂佸憡甯婇崡鍐参涢懜纰夌矗婵☆垱顑欓崵鐐烘煙椤撴粌鐏╂い?
  // 闂佹眹鍨婚崰宥嗩殽閸ヮ灛鐔煎灳瀹曞洨顢呴梺鎸庣⊕濮樸劋绨洪梺?unsafe-eval闂佹寧绋戦張顒€煤鐠恒劉鍋撻悷閭︽Ц闁?
  // 闂佺绻嬪ù鍥敊韫囨稒鏅?jsdelivr CDN 闂佸憡姊绘慨鎯?Monaco Editor 闂佺厧鐡ㄧ喊宥咃耿?
  // frame-src 闂佺绻嬪ù鍥敊韫囨稑绀夐柣妯煎劋缁佷即鎮峰▎蹇旑棦妞わ絽鐖奸悰顕€宕橀幓鎺楀彙闂佹眹鍔岀€氼剛绮婇悽绋跨闁靛闄勭亸锟犳煛閳ь剟骞嗚閻濄倝鏌ㄥ☉妯荤缂備焦姊归悷锝夊焵椤戣法鐤噊uTube闂侀潧妫斿鎺旀椤撱垺鐓€闁告垯鍊楃粈?
  const cspHeader = process.env.NODE_ENV === 'development'
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:* https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';";
  
  // 闂佺懓鍤栭梽鍕春閸涙潙绠ラ柍褜鍓熷鍨緞婵犲啯鍎ラ柟鐓庣摠閺屻劑鎳熼悢闈炲海鎷犻幓鎺濇奖 CSP 闂?
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspHeader]
      }
    });
  });
  
  console.log('[Electron] Content Security Policy configured.');
  if (process.env.NODE_ENV === 'development') {
    console.log('[Electron] Development CSP includes unsafe-eval for Vite HMR.');
  }
  
  // 濠电偛顦崝宀勫船娴犲鍤婃い蹇撳閺嗘澘鈽夐弬娆炬Ц鐎规洘顨堥幏瀣敊绾拌鲸袩闂佽崵鍋涘Λ妤呭吹闁秵鏅?
  const ensureExtendedLengthPath = (filePath) => {
    if (process.platform !== 'win32') {
      return filePath;
    }

    if (!filePath || filePath.startsWith('\\\\?\\')) {
      return filePath;
    }

    const isUncPath = filePath.startsWith('\\\\');
    const needsExtendedPrefix = filePath.length >= 260 || isUncPath;

    if (!needsExtendedPrefix) {
      return filePath;
    }

    if (isUncPath) {
      const uncBody = filePath.replace(/^\\\\/, '');
      return `\\\\?\\UNC\\${uncBody}`;
    }

    return `\\\\?\\${filePath}`;
  };

  const toFileUrl = (rawUrl, protocolName) => {
    let normalizedUrl = rawUrl;

    if (protocolName === 'local-file') {
      normalizedUrl = rawUrl.replace(/^local-file:/i, 'file:');
    } else if (protocolName === 'vscode-file') {
      normalizedUrl = rawUrl.replace(/^vscode-file:\/\/vscode-app/i, 'file://');
    }

    if (/^file:\/\/[a-zA-Z]:/.test(normalizedUrl)) {
      normalizedUrl = normalizedUrl.replace(
        /^file:\/\/([a-zA-Z]:)/,
        'file:///$1'
      );
    }

    return normalizedUrl;
  };

  const decodePathFromCustomProtocol = (rawUrl, protocolName) => {
    let url = rawUrl;
    if (protocolName === 'local-file') {
      url = url.replace(/^local-file:\/\/\/?/, '');
    } else if (protocolName === 'vscode-file') {
      url = url.replace(/^vscode-file:\/\/vscode-app\/?/, '');
    }

    const queryIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');
    const cutIndex = (() => {
      if (queryIndex === -1) return hashIndex;
      if (hashIndex === -1) return queryIndex;
      return Math.min(queryIndex, hashIndex);
    })();
    if (cutIndex !== -1) {
      url = url.substring(0, cutIndex);
    }

    url = url.replace(/^[/\\]+([a-zA-Z]:)/, '$1');
    console.log('[Electron] 缂備礁顦…宄扳枍鎼淬劌纭€闊洦鍑归崬鎾煕閹惧磭肖缂佽鲸鍨垮畷顏嗕沪閸撗冨绩闁荤姴娲㈤崹鐟邦嚕椤掑嫬鏋侀柡澶嬪閸?', url);

    const decodedParts = url.split('/').map(part => {
      try {
        return decodeURIComponent(part);
      } catch (e) {
        return part;
      }
    });


    const decodedPath = decodedParts.join('/');

    const normalizedPath = path.normalize(decodedPath);
    return normalizedPath;
  };

  // 闂佸吋鍎抽崲鑼躲亹閸ヮ剙妫橀柛銉檮椤愪粙鏌?MIME 缂備緡鍋夐褔鎮?
  const getMimeType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      // 闁荤喐鐟ュΛ婵嬨€?
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.ogv': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      // 闂傚倸锕ユ繛濠囥€?
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      // 闂佹悶鍎辨晶鑺ユ櫠?
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      // 闂佺绻戝﹢鍦垝?
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  };

  const handleFileProtocol = (protocolName) => (request, callback) => {
    console.log(`[Electron] ${protocolName} 闂佸憡顨呯换妤咁敊閸涱垱瀚氶梺鍨儑濠€?`, request.url);
    
    try {
      let resolvedPath;
      
      // 闂佺儵鏅涢悺銊ф暜閹绢喗鏅?URL 婵炴垶鎼╅崢鍊熴亹娓氣偓瀹曪綁寮介鍌滃敶闂?
      let urlPath = request.url;
      
      // 缂備礁顦…宄扳枍鎼淬劌纭€闊洦鍑归崬鎾煕閹惧磭肖缂?(local-file:// 闂?local-file:///)
      if (protocolName === 'local-file') {
        urlPath = urlPath.replace(/^local-file:\/\/\/?/, '');
      } else if (protocolName === 'vscode-file') {
        urlPath = urlPath.replace(/^vscode-file:\/\/vscode-app\/?/, '');
      }
      
      // 缂備礁顦…宄扳枍鎼淬劌钃熼柕澶樼厛閸ゅ嫰鏌涘▎蹇撯偓褰掑汲閻旂厧妞介悘鐐跺Г閹劙鏌?
      const queryIndex = urlPath.indexOf('?');
      const hashIndex = urlPath.indexOf('#');
      if (queryIndex !== -1) urlPath = urlPath.substring(0, queryIndex);
      if (hashIndex !== -1) urlPath = urlPath.substring(0, hashIndex);
      
      // URL 闁荤喐鐟辩徊鍧楁偉濠婂牆鏋佺紓鍫㈠█閸ゅ鎮规笟顖氱仩缂?
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch (e) {
        // 婵犵鈧啿鈧綊鎮樻径鎰瀬缂傚牏濮风粔濂告偡濞嗘瑧鎮奸柣鏍ㄧ矋瀵板嫭娼忛銉愭洟鏌ㄥ☉妯垮闁汇劌澧介幏鐘诲即閳垛晛浜鹃柟鐗堟緲閸斻儵鏌涢幒鎴烆棥鐞氭瑩鏌?
        const parts = urlPath.split('/');
        urlPath = parts.map(part => {
          try {
            return decodeURIComponent(part);
          } catch (e) {
            return part;
          }
        }).join('/');
      }
      
      console.log(`[Electron] URL闁荤喐鐟辩徊鍧楁偉濠婂牊鏅?`, urlPath);
      
      // Windows 闁荤姳璀﹂崹鎵閻愭潙绶為柛鏇ㄥ幗閸?
      if (process.platform === 'win32') {
        // 婵犮垼娉涚€氼噣骞?/C:/... 闂佸搫绉堕崢褏妲?
        if (/^\/[A-Za-z]:/.test(urlPath)) {
          urlPath = urlPath.substring(1);
        }
        // 婵犮垼娉涚€氼噣骞?c/Users/... 闂佸搫绉堕崢褏妲愰敓鐘虫櫖闁割偆鍠撻妶濠氭偡濞嗗繒澧曟繛鍛浮瀹曪綁顢涘┑鍡楀箣婵炴潙鍚嬪銊ょ昂闂傚倸瀚ㄩ崐鏇㈠疮鐎ｎ喖鐭楅柛鎴欏€楃粈?
        // 濠碘槅鍋€閸嬫挻绻涢弶鎴剱婵″弶鎮傚畷銉╂晜閼恒儛?"闂佺儵鏅滈…鍥敄?Users" 闂?"闂佺儵鏅滈…鍥敄?..." 闂佹眹鍔岀€氼叀鍟梺?
        else if (/^[A-Za-z]\//.test(urlPath)) {
          // 闂侀潻璐熼崝搴∶鸿箛鏇犵當闁挎洍鍋撻柟顔筋殔鑿愰悹鍥ㄥ絻椤綁鏌涢幇顓炵瑨鐟? c/Users -> C:/Users
          urlPath = urlPath.charAt(0).toUpperCase() + ':' + urlPath.substring(1);
        }
        
        // 缂佺虎鍙庨崰鏇犳崲濮樿埖鍎庢俊顖溾拡閸庡﹤顭块崼鍡楀暙閺?
        if (/^[a-z]:/.test(urlPath)) {
          urlPath = urlPath.charAt(0).toUpperCase() + urlPath.substring(1);
        }
      }
      
      // 闁哄鍎愰崜姘暦閸欏鈻旈柧蹇撶秺閸忓洨绱撴担鍝勬灆闁活厽鍎抽銉╁礋椤掑倸顥曢梺?
      resolvedPath = path.normalize(urlPath);
      
      console.log(`[Electron] 闁荤喐鐟辩徊楣冩倵娴犲瑙﹂幖杈剧稻閻ｉ亶鏌￠崒姘煑婵炲棎鍨婚幑鍕敍濮樿京鐛?`, resolvedPath);
      
      // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姕闁哄鍟粋鎺楁嚋閸倣锕傛煕濮樺墽鐣遍柣掳鍔戦弫?
      if (fs.existsSync(resolvedPath)) {
        const mimeType = getMimeType(resolvedPath);
        console.log(`[Electron] 闂佸搫鍊稿ú锝呪枎閵忊懇鍋撳☉娅亜锕㈤鍫熸櫖閻庢侗婀塎E缂備緡鍋夐褔鎮?`, mimeType);
        return callback({ 
          path: resolvedPath,
          mimeType: mimeType
        });
      } else {
        console.log(`[Electron] 闂佸搫鍊稿ú锝呪枎閵忥紕鈻旂€广儱鎳愰幗鐘绘煥?`, resolvedPath);
        return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      }
    } catch (error) {
      console.error(`[Electron] 闂佸憡顨呯换妤咁敊閸涱喖绶為柛鏇ㄥ幗閸婄偤姊洪幐搴ｆ噯妞?`, error);
      return callback({ error: -2 }); // net::ERR_FAILED
    }
  };
  
  // 濠电偛顦崝宀勫船?local-file:// 闂佸憡顨呯换妤咁敊閸涘瓨鍋ㄩ柕濞垮€楅懝楣冩煕閺冨倸鞋婵炴潙娲鐢割敆閳ь剙锕㈤幘顔兼闁搞儻闄勯?
  protocol.registerFileProtocol('local-file', handleFileProtocol('local-file'));
  // console.log('[Electron]  local-file:// 闂佸憡顨呯换妤咁敊閸涱収鍟呴柛娆忣槹閺嗗牓鏌?);
  
  // 濠电偛顦崝宀勫船?vscode-file:// 闂佸憡顨呯换妤咁敊閸涱喗濯存繝濞惧亾閻犳劗鍠愬鍕炊閳哄倹娈㈤梺鎸庣☉閻楀棝宕ョ€ｎ兘鍋撶涵鍜佹綈婵☆偒鍋婇幃褔宕奸悢灏佹寘闁诲繒鍋炲ú鈺冩?
  protocol.registerFileProtocol('vscode-file', handleFileProtocol('vscode-file'));
  // console.log('[Electron]  vscode-file:// 闂佸憡顨呯换妤咁敊閸涱収鍟呴柛娆忣槹閺嗗牓鏌?);
  
  // 闂?闂佺绻愰悧鍡涘垂閸偅鍙忛悗锝庝簻椤曆囨煙绾版ɑ娅呴柣顐㈢Ф閸栨牠鎳￠妶鍥х厷闂佹寧绋戦悧濠囧极閻愬搫绀冮悘鐐村劤椤ｆ煡鏌?IPC 婵犮垼娉涚€氼噣骞冩繝鍥ч棷妞ゎ厽甯炵粈?
  // 濠电偛顦崝宥夊礈娴煎瓨鏅慨姗嗗墰缁犳垵顪冮妶鍫殭婵犫偓椤忓牆绀嗘繛鎴烆焽缁憋妇绱掗幇顓ф當鐟滅増绋掔粙濠勨偓锝庝簻椤ゅ懏绻涙径鍫濆闁?IPC 婵犮垼娉涚€氼噣骞冩繝鍥ч棷妞ゎ厽甯炵粈澶愭煕濮樺墽鐣遍柛顭戝灠閵嗘帡宕ｆ径灞藉脯闁哄鏅滅粙鎾诲煝閸忕厧顕辨慨姗嗗幗閺嗩亪鏌?"No handler registered" 闂備焦瀵ч悷銊╊敋?
  try {
    await initializeExtensions(null); // 闂佸搫妫楅崐鐟邦渻閸屾稓鈻旂€广儱瀚悙濠囨⒑椤愶絽绗ч柣娑栧劦瀹曪綁鏁愯箛鏇狀槷闂佺绻愰悧濠囧极閻愮儤鏅?IPC 婵犮垼娉涚€氼噣骞冩繝鍥ㄦ櫢?
    
    // 婵炶揪缍€濞夋洟寮妶鍡╂付婵☆垱顑欓崥鍥煠閸愬弶婀版繛鍛懇閹虫繄鎷犺缁€鍕槈閹炬剚鐓兼い锝勭矙閹姤娼忛妸顭戞船闂佸搫鏈幑浣烘崲濡偐鐭欓悗锝庡墻閸氣偓闂佽崵鍋涘Λ瀵告?
    const backgroundColor = await resolveInitialWindowBackgroundColor();
    
    // 闂佸憡甯楃粙鎴犵磽閹惧墎鐜绘俊銈傚亾鐟?
    createWindow(backgroundColor);

    // 闂佸憡甯楃换鍌烇綖閹版澘绀岄柡宥庡亞閻帞绱掗弮鎴濈仭婵犫偓閸ヮ剙绀夐柍钘夋噽缁€鍕煕閿斿搫濡奸柛銊ュ船椤曟瑩鎼归崷顓炵倞闂佸憡鐟辩徊浠嬪箖濡ゅ啰鍗氶悗锝庝簻缁侇噣鏌涢幒鎾剁畵妞ゎ偅鍔欏畷鐘诲冀閻㈢數顦?
    if (mainWindow) {
      try {
        terminalService = new TerminalService(mainWindow);
        setTerminalService(terminalService);
        console.log('[Electron] Terminal service initialized.');
      } catch (error) {
        console.error('[Electron] 缂傚倷绀侀悧蹇涱敂椤掑嫬瀚夌€广儱鎳庨～銈夋煕閹烘挾绠撴い顐ｅ姍瀹曠娀寮借娴滃ジ鏌?', error);
      }
    }

    // 婵☆偓绲鹃悧妤咁敃婵傜绀嗘繝闈涙－濞兼鏌涢弽銊уⅹ闁告埊绱曠槐鎺曠疀閹捐埖娈梺?IPC 濠电偛顦崝宀勫船娴犲妞介悘鐐村劤閳锋牠鎮橀悙瀛樼濠殿喚鍋炲顏堝棘閵堝洨顦柡澶嗘櫆閻熲晠宕抽悜钘夌煑妞ゅ繐娉氭径鎰闁告侗鍨冲畷鍫曟煕濞嗘瑧鍒扮紒鎵佹櫊閹粙鈥﹂幒鎾愁伓?    // 婵炲瓨绮岄張顒勵敃婵傜绠ョ憸鎴︺€?initializeExtensions 婵炴潙鍚嬪畝鎼佸闯閸涘﹤绶炵€广儱妫欓弳鍫ユ煕閹邦剛鐒搁柛搴㈡尦閺?ipcMain.handle闂佹寧绋戦懟顖烆敋闁秵鍤婇柡澶嬪灩绾惧鏌涘▎鎰仴闁诡垰閰ｅ畷婵嬪Ω閵夈儱鑰垮┑顔界箑缁鳖噣骞?    registerSettingsHandlers(settingsManager, workspaceManager, mainWindow);
    registerSettingsHandlers(settingsManager, workspaceManager, mainWindow);
    console.log('[Electron] Settings IPC handlers registered.');
    
    // 濡絽鍟粩?闂佸湱顣介崑鎾绘煛閸繍妲搁柛銊ョ仛閹便劎鈧綆浜滈褔鎮楅悷鐗堟拱闁搞劍宀搁弫宥呯暆閳ь剟鎮洪幋婵愬殫闁告稒鐣埀顒€顦靛Λ鍐閻樺樊娼遍柡澶屽仩濡嫰骞冨Δ鍛劵婵浜崣鈧┑鐐存尭瀵爼鎮＄€ｎ偅浜ゆ繛鎴炲焹閺?
    const sendReadyEvent = () => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('main-process:ready');
      }
    };
    
    // 婵犵鈧啿鈧綊鎮樻径瀣ㄤ簻闁汇垹鎲″銊р偓鐟版啞瑜板啯鎱ㄩ悙瀛樺闁芥ê顦遍弳姘舵煙鐎涙ê濮х紒杈ㄧ箘缁晝鈧綆浜滅粊顕€鏌涘▎鎰伌闁逞屽厸缁躲倗妲愰柆宥呰Е闁挎洍鍋撻柛顭戝灣缁灚寰勬繝鍕€€闂佸憡姊绘慨鎯归崶鈹惧亾閻熺増婀伴柛銊﹀哺瀹曘儲鎯旈垾宕囧矝闂?
    if (mainWindow && mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', sendReadyEvent);
    } else {
      sendReadyEvent();
    }
  } catch (error) {
    console.error('[Electron]  闂佸湱顣介弲娑㈡儓瀹ュ洤瀵查柤濮愬€楅崺鐘绘煕閹烘挾绠撴い顐ｅ姍瀹曠娀寮借娴滃ジ鏌?', error);
    // 闂佸憡顨呴崢鏍ㄧ箾閸ャ劌绶為弶鍫亯琚濇繛鎴炴⒒閸犲酣宕归崡鐑嗗殘闁惧繐婀卞畷鍫曟煕濞嗘瑧绉剁紒杈ㄧ懇閺屽棝宕归鐓庤祴闁圭厧鐡ㄥ濠氬极閵堝纭€闁炽儴灏欑粔鍫曟煥濞戞﹩妾х紒杈ㄧ箖閹峰懘宕卞☉妤冪礆闂佺绻愮粔褰掑闯閸涘﹤绶炵€广儱鎳庨悘锟犳煥?
    if (!mainWindow) {
      createWindow(await resolveInitialWindowBackgroundColor());
    }
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(await resolveInitialWindowBackgroundColor());
    }
  });
});

/**
 * 闂佸湱顣介崑鎾绘煛閸繍妲洪柣娑栧劦瀹曪綁鏁愰崨顓炵稑闂傚倸鍋嗛崢钘夘渻閸岀偞鐒婚柍褜鍓熷畷娆撴偖鐎靛摜顦﹎acOS 闂傚倸瀚ㄩ崐鏇⑺囨繝姘櫢?
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 闁圭厧鐡ㄥ濠氬极閵堝鐒婚柍褜鍓熷畷娆撳传閸曨偒鏋€濠电偞鎸搁幊鎰板箖?
 */
app.on('before-quit', () => {
  console.log('[Electron] 闁圭厧鐡ㄥ濠氬极閵堝纭€闁告劘灏欏▓娲⒑椤愮喎浜鹃梺鍛婂灩鐏忋劎妲愬┑鍡愨偓鎺楀川椤栨稑鈧偤鎮硅鐎氼厾鑺?..');
});

/**
 * IPC 闂備緡鍋呴惌顔界┍婵犲啫绶為柛鏇ㄥ幗閸?
 */
ipcMain.handle('extension:list', async () => {
  // 闂佸吋鍎抽崲鑼躲亹閸ヮ剙绠ラ柍褜鍓熷鍨緞鐎ｎ亞绁烽梺?
  const allPlugins = pluginManager.getAllExtensions();
  
  // 闁哄鏅涘ú锕傚箮閵堝鏅?TypeScript 闂佺儵鏅濋…鍫ュ矗瑜旈幆鍐礋椤掆偓缁茶霉閻樹警鍟囩紒杈ㄧ懄娣囧﹪宕掑☉姘嚱闂佸搫鐗嗛¨鈧紒?
  const filteredPlugins = allPlugins.filter(plugin => {
    const name = (plugin.name || '').toLowerCase();
    const id = (plugin.id || '').toLowerCase();
    return !name.includes('typescript') && 
           !id.includes('typescript') &&
           !name.includes('ts-language') &&
           !id.includes('vscode.typescript');
  });
  
  console.log(`[IPC] 闁哄鏅滈弻銊ッ洪弽顓炵闁瑰搫绉甸浠嬫煕閹烘搩娈欓柕? ${filteredPlugins.length} 婵炴垶鎼╂禍婵娿亹閸愵喗鏅?(闂佽鍓涚划顖炲汲? ${allPlugins.length})`);
  
  return filteredPlugins;
});

ipcMain.handle('extension:toggle', async (event, extensionId, enabled) => {
  try {
    console.log('[IPC] extension:toggle', extensionId, enabled ? 'enabled' : 'disabled');
    // TODO: 闁诲骸婀遍崑鐔肩嵁閸ヮ剙绠ラ柍杞拌兌濞兼棃鏌ｉ妸銉ヮ仼闁诡垰閰ｉ弫?缂備礁鍊烽懗鍫曞极閵堝鐒婚柡鍕箳鐢?
    return { success: true };
  } catch (error) {
    console.error('[IPC] 闂佸憡甯掑ú锕€鐣烽弻銉ョ闁宠桨鑳跺鏂款熆閹壆绨块悷?', error);
    return { success: false, error: error.message };
  }
});

/**
 * 婵炴垶鎸搁…鐑姐€傛禒瀣剮缂佸鐏濊ぐ?IPC 婵犮垼娉涚€氼噣骞?
 * 濠电偛顦崝宥夊礈娴煎瓨鏅慨姗嗗亜閻︽粓鏌?IPC 婵犮垼娉涚€氼噣骞冩繝鍥ч棷闁靛鍎遍崵鎺楁煥?storeHandlers.ts 婵炴垶鎼╅崢浠嬪极閻愬搫绀冪€光偓鐎ｎ剛顦柡澶嗘櫆閻熲晠宕抽悜钘夌煑妞ゅ繐鍟扮粻浠嬫煟閿濆棛鎳佺紒銊ｅ妽缁傛帡宕滄担鍦紘闂?
 */

// 婵炴垶鎸搁…鐑姐€傞悾灞藉闁煎鍊楅崺鐘绘煟濠婂嫭绶叉繝鈧鍫熷仺閺夊牄鍔忛々顐︽煛鐏炵偓宕勭紒缁橆焽缁瑧鈧綆鍠掗崑鎾愁潩瀹曞洨鐣?IPC 闂佸憡绮岄張顒勫蓟婵犲啰鈻斿┑鐘冲嚬閺嗩垶鏌℃担鍝勵暭鐎规挷鐒﹂幆鏃堝箻妫版繂鎮侀梺?
// 闂佸搫鍞查崨顔炬殸婵炴垶鎸搁…鐑姐€傞懞銉ь洸閻庯絺鏅滈浠嬫煟閳哄倸鐏ラ柟顖氼樀瀹曟娊濡搁妷銉ユ缂備礁顦…宄扳枍?

ipcMain.handle('extension:execute-command', async (event, command, ...args) => {
  // 闁哄鏅滈悷鈺呭闯閻戣姤顥嗛柍褜鍓涢幉鐗堟媴閸濄儲婢栭梺缁樼矋濠㈡﹢骞婇埄鍐浄闁靛牆妫楅埛鏃堟偠濞戞鐒搁柍褜鍓氬Σ鎺旀?
  console.log('[IPC] 闂佸湱鐟抽崱鈺傛杸闂佸憡绋掗崹婵嬪箮?', command, args);
  return { success: true };
});

/**
 * AI 闂佺儵鏅濋…鍫ュ矗?IPC 婵犮垼娉涚€氼噣骞?
 * 婵炲濯寸徊鍧楀箖?fetch 闁荤姴娲弨閬嶆儑娴煎瓨鏅€光偓閸曨亞绱氶梺绋跨箰缁夌數鎲伴崱娑樿摕闁规儳婀辩粻鑽ょ磼鐎ｎ亶鍎庨柤鍨灴閺?SSL 闂佸憡顨呯换妤咁敊閸涘瓨鐓ユ繛鍡樺俯閸?
 */
ipcMain.handle('ai:fetch', async (event, url, options = {}) => {
  console.log('[IPC] AI Fetch 闁荤姴娲弨閬嶆儑?', url);
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      // 闂佸憡鍨靛Λ妤吽囬鍌涘珰闂佸灝顑囧﹢鎾⒑椤愩埄妯€闁?
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        // 缂備礁鍊烽懗鍫曞极閵堝洦瀚氬ù锝呭槻婵稑螖閻樿尙鐒烽柣锕€顦甸弫宥呯暆閸曨亞绱氶梺绋跨箰缁夌兘宕靛鍛┏闁诡垎鍕偓鎶芥偣閸ワ附顦烽柛鏃傚枛濮婂顢氶埀顒勩€?
        rejectUnauthorized: false
      };
      
      // 闂佸憡鐟﹂崹濂稿箲閿濆洦瀚氶梺鍨儑濠€?
      const req = client.request(requestOptions, (res) => {
        let body = '';
        
        // 闁荤姳绀佹晶浠嬫偪閸℃瑧纾介柡宥庡亞閸?
        res.setEncoding('utf8');
        
        // 闂佽　鍋撻柛顐ｆ礃閼茬娀鏌涘┑鍡櫺㈢紒銊︾叀瀵偊鎮ч崼婵堛偊
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        // 闂佸憡绻傜粔瀵歌姳閼碱剛纾奸柟鎯х摠鐏?
        res.on('end', () => {
          console.log('[IPC] AI Fetch 闂佸憡绻傜粔瀵歌姳閺屻儲鍋愰悹浣筋潐鐎?', res.statusCode);
          
          // 闁诲繐绻愬Λ妤呭箹闁垮鍎熼柡鍐ㄦ处缁侇噣鏌熺拠鈩冪窔閻犳劗鍠栧畷锝夘敍濮樿京顣查梺鍛婂笚椤ㄥ懐鈧灚鐓￠幆鍐礋椤掑倸顥曢梺?
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: body
          });
        });
      });
      
      // 闂備焦瀵ч悷銊╊敋閵堝棗绶為柛鏇ㄥ幗閸?
      req.on('error', (error) => {
        console.error('[IPC] AI Fetch 闂備焦瀵ч悷銊╊敋?', error);
        reject(error);
      });
      
      // 闂佸憡鐟﹂崹鍧楀焵椤戞寧绁版い鏇ㄥ墮鏁堥柛灞剧懅缁夊ジ鏌ㄥ☉妯煎妞も敪鍥у嚑婵犲﹤瀚粻鎺楁煥?
      if (options.body) {
        req.write(options.body);
      }
      
      // 缂傚倷鐒﹂幐璇差焽椤愩倖瀚氶梺鍨儑濠€?
      req.end();
    } catch (error) {
      console.error('[IPC] AI Fetch 閻庢鍠栭崐鎼佹偉?', error);
      reject(error);
    }
  });
});

ipcMain.handle('extension:send-message', async (event, extensionId, message) => {
  // 闁哄鏅滈悷鈺呭闯閻戣姤顥嗛柍褜鍓涢幉鐗堟媴閸濄儲婢栭梺缁樼矌婢ф鏅剁捄銊ゆ勃闁哄洨鍠撳暩闂佽鍙庨崹鎷屻亹閸岀偞鐒诲〒姘ｅ亾闁逞屽墯濡叉帞娆?
  console.log('[IPC] 闂佸憡鐟﹂崹鍧楀焵椤戣法鍔嶇紒澶屽厴楠炰線顢涘顒傚帓闂佸湱顣介弲娑㈡儓?', extensionId, message);
  return { success: true };
});

/**
 * 闂佸搫鍊稿ú锝呪枎閵忋倕绠肩€广儱瀚粙?IPC 婵犮垼娉涚€氼噣骞?
 */

// 闂佺懓鐏氶幐鍝ユ閹达箑妫橀柛銉檮椤愪粙鎮楅悽娈挎敯闁伙缚绮欓弫?
ipcMain.handle('file:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Supported Files', extensions: ['md', 'markdown', 'json', 'txt'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      
      // 婵°倗濮撮惌渚€鎯佹径鎰闁搞儻闄勯鐣岀磼椤愩儺鍤欓柣?
      if (!workspaceManager.isSupportedFileType(filePath)) {
        return {
          success: false,
          error: 'Unsupported file type. Only .md, .markdown, .json, .txt are allowed.'
        };
      }
      
      const content = await fsPromises.readFile(filePath, 'utf-8');
      const language = workspaceManager.getFileLanguage(filePath);
      
      // 濠电儑缍€椤曆勬叏閻愬搫绀嗛柣妤€鐗婃禒姗€寮堕埡鍌氱仸闁哄鍟粋鎺旀崉閸濆嫮浠氶梺?
      workspaceManager.addRecentFile(filePath);
      workspaceManager.setLastOpenedFile(filePath);
      
      return {
        success: true,
        data: {
          path: filePath,
          content: content,
          name: path.basename(filePath),
          language: language
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佺懓鐏氶幐鍝ユ閹达箑妫橀柛銉檮椤愯棄顭块幆鎵翱閻?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佺懓鐏氶幐鍝ユ閹寸姵鍠嗛柛鈩冧緱閺嗐儵鏌￠崒姘煑婵炲棎鍨婚埀顒傛暩椤㈠﹪鎯佹禒瀣櫢?
ipcMain.handle('video:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      return {
        success: true,
        data: {
          path: filePath,
          name: path.basename(filePath),
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佺懓鐏氶幐鍝ユ閹寸姵鍠嗛柛鈩冧緱閺嗐儵鏌￠崒姘煑婵炲棎鍨哄鍕綇椤愩儛?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闁荤姴娲╅褑銇愰崶顒€绠伴柛銉戝懏姣庨柣鐘辫閸ㄦ壆娆㈤悙鐑樺剭闁告洦鍓氶悗顔济归悩渚晣缂佽鲸鐟╅幃浠嬪Ω閵堝洩澹橀梺鍝勫€稿ú锝呪枎閵忋倕鍐€闁瑰瓨绻傞拑鐔兼煕閹寸姷甯涘褝绠戦锝夊焵椤掑嫭鏅?
ipcMain.handle('file:read', async (event, filePath) => {
  try {
    // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姕闁哄鍟粋鎺楁嚋閸倣锕傛煕濮樺墽鐣遍柣掳鍔戦弫?
    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: 'Path exists but is not a file.'
      };
    }
    
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const language = workspaceManager.getFileLanguage(filePath);
    
    // 濠电儑缍€椤曆勬叏閻愬搫绀嗛柣妤€鐗婃禒姗€寮堕埡鍌氱仸闁哄鍟粋鎺旀崉閸濆嫮浠氶梺?
    workspaceManager.addRecentFile(filePath);
    workspaceManager.setLastOpenedFile(filePath);
    
    return {
      success: true,
      data: {
        path: filePath,
        content: content,
        name: path.basename(filePath),
        language: language
      }
    };
  } catch (error) {
    console.error('[IPC] 闁荤姴娲╅褑銇愰崶顒€妫橀柛銉檮椤愯棄顭块幆鎵翱閻?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佺懓鐏氶幐鍝ユ閹达箑鐐婇柛鎾楀喚鏆梺鍝勫€稿ú锝呪枎閵忊懇鍋撻悽娈挎敯闁伙缚绮欓弫?
ipcMain.handle('image:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const imagePath = result.filePaths[0];
      
      return {
        success: true,
        data: {
          path: imagePath,
          name: path.basename(imagePath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佺懓鐏氶幐鍝ユ閹达箑鐐婇柛鎾楀喚鏆繝銏″劶缁墽鎲?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佺懓鐏氶幐鍝ユ閹寸偛绶炴慨姗嗗幗閻庮喖霉閻樿尙鍩ｉ柍褜鍓欓ˇ鎵偓姘ュ妿閳ь剛鏁搁、濠囨儊閽樺娴栭柛鈽嗗幘缁€鍕煟椤剙濡虹紒顭戝墴閹矂濡烽妸褎顫氶柟鐓庣摠閹告悂顢氶柆宥呯闁靛鍨崇粈?
ipcMain.handle('file:openMultiple', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Files', extensions: ['md', 'markdown', 'json', 'txt'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      // 闁哄鏅涘ú锕傚箮閵堝妫橀柛銉檮椤愮晫绱掗銉殭闁诲海鍏橀弫宥囦沪閽樺閿柡澶嗘櫆閺屻劌煤閺嶎厼缁╂い鏍ㄧ☉閻︻噣鏌ｉ妸銉ヮ仾闁哄鍟撮弫?
      const supportedExtensions = ['md', 'markdown', 'json', 'txt'];
      const filteredPaths = result.filePaths.filter(filePath => {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        return supportedExtensions.includes(ext);
      });

      if (filteredPaths.length === 0) {
        return {
          success: false,
          error: 'No supported files selected. Allowed: .md, .markdown, .json, .txt.'
        };
      }

      return {
        success: true,
        data: filteredPaths
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佺懓鐏氶幐鍝ユ閹寸偛绶炴慨姗嗗幗閻庮喖霉閻樼儤纭炬い鏇ㄥ枤閹风姴鈹戦崶鑸垫暠婵犮垺鍎肩划鍓ф喆?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佺懓鐏氶幐鍝ユ閹达箑妫橀柛銉檮椤愯棄顭块崜浣瑰殌妞ゆ洦鍠氶幏鐘测攽閸ヨ埖鏁遍梺鎸庣☉閻楀繘寮妶鍡欘洸閹肩补鈧尙鐭楁繛杈剧稻缁瞼浜搁鐐存櫖閻忕偠鍋愮粣妤呮偣娴ｇ鈷旈柣銈呮椤斿繘濡烽妶鍥┾枙闂佸憡鐗炲▍锝吤洪幏灞讳汗闁哄浂浜炵粈?
ipcMain.handle('folder:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      
      // 婵烇絽娲︾换鍌炴偤閵娿儺鍟呴柕澶堝€楃粙濠囨煕閺嶎厾绱伴柣顓㈢畺閺?
      workspaceManager.setWorkspaceDir(folderPath);
      
      return {
        success: true,
        data: {
          path: folderPath,
          name: path.basename(folderPath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佺懓鐏氶幐鍝ユ閹达箑妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁靛洦鍨块弫?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佺懓鐏氶幐鍝ユ閹达箑妫橀柛銉檮椤愯棄顭块崜浣瑰殌妞ゆ洦鍠氶幏鐘测攽閸ヨ埖鏁遍梺鎸庣☉閻楀繘寮妶鍡欘洸閹艰揪绲块崣鈧柣鐘叉搐濡鑺辨潏鈹惧亾閻㈤潧甯堕柛娆忔閺佸秶浠﹂懖鈺冩喒闁荤姳绀佹晶浠嬫偪閸℃鍟呴柕澶堝€楃粙濠囨煕閺嶎剚顏犳繛鍙夊閵囨劙寮撮鍡欘槴
ipcMain.handle('knowledge-base:open-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      
      // 闂佹椿鍘归崕鎾儊閹寸偞鍎熼柟鐐墯閸ゃ倝鏌涜箛瀣姕闁哄鍟粋鎺旀崉閹帊绮存繛鎴炴尭缁夌兘顢欓弴鐘电＞妞ゆ棃妫跨槐锝吤归敐鍡欑煀閻忓浚鍨堕幆鍕敊閼测晝协闂佹寧绋戞總鏃傛偖闁秵鍤€闁告侗鍘鹃弳姘舵煕韫囧濡块悗姘煎弮閺?
      
      return {
        success: true,
        data: {
          path: folderPath,
          name: path.basename(folderPath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佺懓鐏氶幐鍝ユ閹达箑妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁靛洦鍨块弫?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佽顔栭崑鍛嚕閸ф妫橀柛銉檮椤愯棄顭块崼鏇楀亾濞戞粌骞€闂佹眹鍔岀€氼參寮鈧獮鎰媴鐟欏嫮鈧喖霉閻樹警鍟囩紒杈ㄧ懇閹粙濡搁妶鍥闂佹椿鍘归崕鎾儊閹寸偞鍎熼柟鐐墯閸ゃ倝鏌涜箛瀣姷缂?
ipcMain.handle('folder:scanFiles', async (event, folderPath) => {
  try {
    const supportedExtensions = ['md', 'markdown', 'json', 'txt'];
    const filePaths = [];

    // 闂備緡鍋呯敮鎺旂礊婵犲洤绠ユい鎰剁到娴煎酣鏌￠崒姘煑婵炲棎鍨介弫?
    const scanDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 闂備緡鍋呯敮鎺旂礊婵犲洤绠ユい鎰剁到娴煎酣鎮楀☉娆忓闁哄鍟粋鎺旀崉閹帊绮?
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姕闁哄鍟粋鎺楁嚋闂堟稈鎸呴柣蹇曞仦濞叉牠骞?
          const ext = path.extname(entry.name).toLowerCase().slice(1);
          if (supportedExtensions.includes(ext)) {
            filePaths.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(folderPath);

    return {
      success: true,
      data: filePaths
    };
  } catch (error) {
    console.error('[IPC] 闂佽顔栭崑鍛嚕閸ф妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁靛洦鍨块弫?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闁荤姴娲╅褑銇愰崶顒€妫橀柛銉檮椤愯棄顭跨捄鐑樿础婵炲弶濯介妵鎰板即閻樺灚灏濋梺?
ipcMain.handle('folder:read-tree', async (event, folderPath) => {
  try {
    const readDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const nodes = [];
      
      for (const entry of entries) {
        // Keep hidden folders visible in workspace tree; only skip node_modules.
        if (entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(folderPath, fullPath);
        
        if (entry.isDirectory()) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'directory',
            isExpanded: false,
            children: []
          });
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          let language = 'text';
          
          // 闂佸搫绉烽～澶婄暤娓氣偓楠炲秹鍩℃担鐑樼秾闂佸憡鑹剧粔鍫曞灳濡皷鍋撶憴鍕孩妞ゆ洏鍨婚幊娑㈠焵?
          if (['.js', '.jsx'].includes(ext)) language = 'javascript';
          else if (['.ts', '.tsx'].includes(ext)) language = 'typescript';
          else if (['.md', '.markdown'].includes(ext)) language = 'markdown';
          else if (ext === '.json') language = 'json';
          else if (['.css', '.scss', '.sass', '.less'].includes(ext)) language = 'css';
          else if (ext === '.html') language = 'html';
          else if (ext === '.py') language = 'python';
          else if (ext === '.java') language = 'java';
          else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) language = 'cpp';
          
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'file',
            language: language
          });
        }
      }
      
      // 闂佸湱鍎ょ敮鎺旇姳椤撱垺鏅慨妯块哺缁愭鎲搁悧鍫熺婵犫偓椤忓牆绀堢€广儱绻掔粈澶愭煛閸屾碍鐭楁繛鍡愬灲瀹曠兘濡搁妷锕€鈧敻鏌ㄥ☉妯垮闁诡喖娲幊娑㈩敂閸涱厾妯嗛柣搴㈢⊕椤ㄥ棝鎯佸┑瀣闁圭儤鍨圭喊?
      nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
      
      return nodes;
    };
    
    const tree = await readDirectory(folderPath);
    
    return {
      success: true,
      data: tree
    };
  } catch (error) {
    console.error('[IPC] 闁荤姴娲╅褑銇愰崶顒€妫橀柛銉檮椤愯棄顭跨捄鐑樿础缂侇喓鍔戝鎼佸礋椤愮姳鏉梺?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備緡鍋呯敮鎺旂礊婵犲洦鍤旂€瑰嫭婢樼徊鍧楁煙绾版ê浜鹃梺鍝勭墕椤﹂亶鎮烽鍡樺闁绘鐗婇悗顔济归悩渚晣缂佽鲸鐟﹀濠氬炊閵婏箑袘闂佺懓鎼ˇ浼村几閸愨晝顩烽悹鐑樹航娴犳岸鏌?
ipcMain.handle('folder:get-all-notes', async (event, folderPath) => {
  try {
    const allFiles = [];
    
    // 闂備緡鍋呯敮鎺旂礊婵犲嫭瀚氶悹鍥ㄥ絻缁插潡鏌熺喊妯轰壕闂佸搫鐗嗛ˇ浼村几閸愵喗鏅?
    const readFilesRecursively = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Ignore hidden entries when collecting note files.
        if ((entry.name.startsWith('.') && entry.name !== '.wstudio') || entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 闂備緡鍋呯敮鎺旂礊婵犲啫绶為柛鏇ㄥ幗閸婄偤鎮楀☉娆忓婵炶弓鍗抽弫?
          await readFilesRecursively(fullPath);
        } else {
          // 闂佸憡鐟禍婵嬪锤婵犲洤绀夐柣妯挎珪閻庮喖霉閻樹警鍟囩紒杈ㄧ懇瀵劑顢涘☉妯兼Х闂佹眹鍔岀€氼噣鎮烽鍡樺闁绘鐗忔竟鎰偓娈垮枛妤犲繒妲?
          const ext = path.extname(entry.name).toLowerCase();
          const supportedExtensions = ['.md', '.markdown', '.txt', '.json'];
          
          if (supportedExtensions.includes(ext)) {
            const relativePath = path.relative(folderPath, fullPath);
            const stats = await fsPromises.stat(fullPath);
            
            // 闁荤姴娲╅褑銇愰崶顒€妫橀柛銉檮椤愮晫绱掑Δ濠傚幐缂佹梹鎸抽弫?
            let firstLine = '';
            try {
              const content = await fsPromises.readFile(fullPath, 'utf-8');
              // 闂佸吋鍎抽崲鑼躲亹閸モ晝绠旀い鎴ｆ硶椤忛亶鎮跺☉妯肩劯婵炵⒈浜炵划姘跺传閸曨偅鏆ラ梺?
              const lines = content.split('\n');
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                  firstLine = trimmedLine;
                  break;
                }
              }
            } catch (error) {
              console.warn(`[IPC] 闁荤姴娲╅褑銇愰崶顒€妫橀柛銉檮椤愮晫绱掑Δ濠傚幐缂佹柨顕幃鎵沪婵劒鏉梺? ${fullPath}`, error);
            }
            
            allFiles.push({
              id: fullPath,
              name: entry.name,
              path: fullPath,
              relativePath: relativePath,
              type: 'file',
              size: stats.size,
              createdAt: stats.birthtime,
              updatedAt: stats.mtime,
              firstLine: firstLine
            });
          }
        }
      }
    };
    
    await readFilesRecursively(folderPath);
    
    // 闂佸湱顭堥ˇ顖炲箖閺囩姷鐭撻柣妤€鐗嗙粭鎾绘煥?
    allFiles.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      success: true,
      data: allFiles
    };
  } catch (error) {
    console.error('[IPC] 闂佸吋鍎抽崲鑼躲亹閸ヮ剙绠ラ柍褜鍓熷鍨緞瀹€鈧幊澶愭偣娴ｅ搫顣奸柡瀣暞缁傛帞鎹勯幁鎺嶆澀闂?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佸憡甯楃粙鎴犵磽閹捐妫橀柣妤€鐗婇悗顕€鏌?
ipcMain.handle('folder:create-file', async (event, parentPath, fileName) => {
  try {
    const filePath = path.join(parentPath, fileName);
    
    // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姕闁哄鍟粋鎺楁嚋閸倣锕傛煕濮樺墽鐣遍柛鎴磿閳ь剚绋掗敋婵犫偓?
    try {
      await fsPromises.access(filePath);
      return {
        success: false,
        error: 'File already exists.'
      };
    } catch {
      // 闂佸搫鍊稿ú锝呪枎閵忥紕鈻旂€广儱鎳愰幗鐘绘煕閿旇崵鍘滅紒杈ㄧ箘缁辨帟顦撮柣銏狀煼瀹曟艾鈽夊Ο鑲╁
    }
    
    // 闂佸憡甯楃粙鎴犵磽閹惧墎鐭氶柣鎴炆戦悗顕€鏌?
    await fsPromises.writeFile(filePath, '', 'utf-8');
    
    return {
      success: true,
      data: {
        path: filePath,
        name: fileName
      }
    };
  } catch (error) {
    console.error('[IPC] 闂佸憡甯楃粙鎴犵磽閹捐妫橀柛銉檮椤愯棄顭块幆鎵翱閻?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 婵犮垼娉涚粔鎾春濡ゅ懎妫橀柛銉檮椤愪粙鏌涢幒鎾愁棆婵炶弓鍗冲浠嬪炊閵婏妇鈧喖霉閻樼儤纭鹃柕?
ipcMain.handle('file:copy-to-folder', async (event, sourcePath, targetFolderPath) => {
  try {
    // 缂佺虎鍙庨崰鏇犳崲濮樿埖鍎庢い鏃傛櫕閸ㄥジ鏌￠崒姘煑婵炲棎鍨哄鍕偡閹殿喗鎲奸梺?
    await fsPromises.mkdir(targetFolderPath, { recursive: true });
    
    // 闂佸吋鍎抽崲鑼躲亹閸パ€鏀﹂柟閭﹀幗閻庮喖霉閻樼儤纭鹃柟?
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetFolderPath, fileName);
    
    // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姢婵炶弓鍗冲浠嬪炊閵婏妇鈧喖霉閻樺搫鐓愭俊鍙夋倐瀹曘儵鏁冮埀顒勫礄閿涘嫧鍋撳☉娅亜锕?
    try {
      await fsPromises.access(targetPath);
      // 闂佸搫鍊稿ú锝呪枎閵忕媭鍟呴柟缁樺笧閹界娀鏌涢敂鑽ゅ帨缂佽鲸绻堥幃浠嬫偄缁嬭法浜ｉ梺鍝勫€绘晶妤呭几閸愨晝顩烽悹铏瑰劋閸?
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      const timestamp = Date.now();
      const newFileName = `${nameWithoutExt}_${timestamp}${ext}`;
      const newTargetPath = path.join(targetFolderPath, newFileName);
      
      // 婵犮垼娉涚粔鎾春濡ゅ懎妫橀柛銉檮椤?
      await fsPromises.copyFile(sourcePath, newTargetPath);
      
      return {
        success: true,
        data: {
          path: newTargetPath,
          name: newFileName
        }
      };
    } catch {
      // 闂佸搫鍊稿ú锝呪枎閵忥紕鈻旂€广儱鎳愰幗鐘绘煕閿旇崵鍘滅紒杈ㄧ箞閹嫮鈧稒锚婢跺秴顭跨捄铏剐㈤柛?
      await fsPromises.copyFile(sourcePath, targetPath);
      
      return {
        success: true,
        data: {
          path: targetPath,
          name: fileName
        }
      };
    }
  } catch (error) {
    console.error('[IPC] 婵犮垼娉涚粔鎾春濡ゅ懎妫橀柛銉檮椤愯棄顭块幆鎵翱閻?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佸憡甯楃粙鎴犵磽閹捐妫橀柣妤€鐗婇悗顔济归悩鐑樼【闁?
ipcMain.handle('folder:create-folder', async (event, parentPath, folderName) => {
  try {
    const folderPath = path.join(parentPath, folderName);
    
    // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姕闁哄鍟粋鎺旀崉閹帊绮撮梺鍝勫閸ㄤ即骞嗘担鍓插晠闁圭粯甯為幗鐘绘煥?
    try {
      await fsPromises.access(folderPath);
      return {
        success: false,
        error: 'Folder already exists.'
      };
    } catch {
      // 闂佸搫鍊稿ú锝呪枎閵忊€崇窞闂侇偅绋撻悷婵嬫倵濞戞顏勶耿椤忓牊鏅€光偓閳ь剟骞嬫搴ｇ＜妞ゆ挾鍋涢悘锟犳煥?
    }
    
    // 闂佸憡甯楃粙鎴犵磽閹捐妫橀柛銉檮椤愪粙鏌?
    await fsPromises.mkdir(folderPath, { recursive: false });
    
    return {
      success: true,
      data: {
        path: folderPath,
        name: folderName
      }
    };
  } catch (error) {
    console.error('[IPC] 闂佸憡甯楃粙鎴犵磽閹捐妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁靛洦鍨块弫?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 缂佺虎鍙庨崰鏇犳崲濮樿泛妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁宦板姂瀹曠兘鈥﹂幒鏃傤槱闂備緡鍋呯敮鎺旂礊婵犲洤绀嗘繛鎴烆焽缁憋箓鏌?
ipcMain.handle('folder:ensure-dir', async (event, dirPath) => {
  try {
    // 婵炶揪缍€濞夋洟寮?recursive: true 缂佺虎鍙庨崰鏇犳崲濮樿泛绠ラ柍褜鍓熷鍨緞鐏炵晫鍘梺鍝勫€稿ú锝呪枎閵忊€崇窞鐟滅増甯掗崢鎾偠濮樼厧浜滈柛銊╀憾閺?
    await fsPromises.mkdir(dirPath, { recursive: true });
    
    return {
      success: true,
      data: {
        path: dirPath
      }
    };
  } catch (error) {
    console.error('[IPC] 缂佺虎鍙庨崰鏇犳崲濮樿泛妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁宦板姂瀹曠兘濡搁妷锝勬澀闂?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闁诲繒鍋炲ú鏍閹达箑妫橀柛銉檮椤愯棄顭块崜浣诡仧缂佽鲸鐟╅獮濠囧箳閹存繍娼遍柡澶屽仩濡嫰鎮哄▎鎾村剮妞ゆ棁鍋愮粔鍧楁煥?
ipcMain.handle('folder:expand', async (event, folderPath, rootPath) => {
  try {
    const readDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const nodes = [];
      
      for (const entry of entries) {
        // Keep hidden folders visible in workspace tree; only skip node_modules.
        if (entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        
        if (entry.isDirectory()) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'directory',
            isExpanded: false,
            children: []
          });
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          let language = 'text';
          
          // 闂佸搫绉烽～澶婄暤娓氣偓楠炲秹鍩℃担鐑樼秾闂佸憡鑹剧粔鍫曞灳濡皷鍋撶憴鍕孩妞ゆ洏鍨婚幊娑㈠焵?
          if (['.js', '.jsx'].includes(ext)) language = 'javascript';
          else if (['.ts', '.tsx'].includes(ext)) language = 'typescript';
          else if (['.md', '.markdown'].includes(ext)) language = 'markdown';
          else if (ext === '.json') language = 'json';
          else if (['.css', '.scss', '.sass', '.less'].includes(ext)) language = 'css';
          else if (ext === '.html') language = 'html';
          else if (ext === '.py') language = 'python';
          else if (ext === '.java') language = 'java';
          else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) language = 'cpp';
          
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'file',
            language: language
          });
        }
      }
      
      // 闂佸湱鍎ょ敮鎺旇姳椤撱垺鏅慨妯块哺缁愭鎲搁悧鍫熺婵犫偓椤忓牆绀堢€广儱绻掔粈澶愭煛閸屾碍鐭楁繛鍡愬灲瀹曠兘濡搁妷锕€鈧敻鏌ㄥ☉妯垮闁诡喖娲幊娑㈩敂閸涱厾妯嗛柣搴㈢⊕椤ㄥ棝鎯佸┑瀣闁圭儤鍨圭喊?
      nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
      
      return nodes;
    };
    
    const children = await readDirectory(folderPath);
    
    return {
      success: true,
      data: children
    };
  } catch (error) {
    console.error('[IPC] 闁诲繒鍋炲ú鏍閹达箑妫橀柛銉檮椤愯棄顭块崜浣瑰殌闁靛洦鍨块弫?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佸憡鐟辩粻鎴︽偤閵婏妇鈻旈柛婵嗗閸ょ娀鎮归崶銊х畺妞?
ipcMain.handle('file:save-as', async (event, content = '', options = {}) => {
  try {
    const requestedDefaultPath =
      options && typeof options.defaultPath === 'string'
        ? options.defaultPath.trim()
        : '';
    const fallbackWorkspacePath = workspaceManager.getWorkspaceDir();
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ],
      defaultPath: requestedDefaultPath || fallbackWorkspacePath
    });

    if (!result.canceled && result.filePath) {
      await fsPromises.writeFile(result.filePath, content, 'utf-8');
      
      // 濠电儑缍€椤曆勬叏閻愬搫绀嗛柣妤€鐗婃禒姗€寮堕埡鍌氱仸闁哄鍟粋鎺旀崉閸濆嫮浠氶梺?
      workspaceManager.addRecentFile(result.filePath);
      
      return {
        success: true,
        data: {
          path: result.filePath,
          name: path.basename(result.filePath),
          language: workspaceManager.getFileLanguage(result.filePath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 闂佸憡鐟辩粻鎴︽偤閵婏妇鈻旈柛婵嗗娴滃ジ鏌?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 婵烇絽娲︾换鍌炴偤閵娾晛妫橀柛銉檮椤?
ipcMain.handle('file:save', async (event, filePath, content) => {
  try {
    await fsPromises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('[IPC] 婵烇絽娲︾换鍌炴偤閵娾晛妫橀柛銉檮椤愯棄顭块幆鎵翱閻?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * 缂備焦鍔栭〃鍛般亹濞戙垹绠崇憸宥夊春?IPC 婵犮垼娉涚€氼噣骞?
 */
ipcMain.on('minimize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('maximize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

ipcMain.handle('window:create-new-instance', async () => {
  try {
    const backgroundColor = await resolveInitialWindowBackgroundColor();
    const createdWindow = createWindow(backgroundColor);
    return { success: true, windowId: createdWindow.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});


ipcMain.handle('window:set-background-color', async (event, color) => {
  try {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) {
      return { success: false, error: 'Target window not found' };
    }

    const normalizedColor = typeof color === 'string'
      ? toOpaqueHex(color, '#1e1e1e')
      : '#1e1e1e';
    targetWindow.setBackgroundColor(normalizedColor);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
