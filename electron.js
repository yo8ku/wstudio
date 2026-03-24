/**
 * Electron 濠电偞鍨堕幐璇参ｉ幒鏃€宕叉俊顖濆亹閻瑩鎮楅敐搴濈凹闁稿孩鐟╅弻娑㈠棘鐠囨彃顬夐梺鍝勵儏閸熸挳寮?
 */

const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu, globalShortcut, systemPreferences, screen } = electron;
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');
const http = require('http');
const { fileURLToPath } = require('url');

// 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥箓鎳氶埡鍐ｅ亾濞堝灝鏋涚紒璇差儑缁參宕ㄩ婊呯効婵炶揪绲块崕銈夊汲韫囨稒鍊甸柣鐔煎亰濡叉悂鏌涘▎蹇曠闁瑰嘲鍟撮弫鍐焵椤掑嫬绠熼柨鐔哄У閺咁剟鏌涢鐘茬仾闁哄懐顭堥湁婵犙呭Т婵厽鎷呴崜鎻掓闂婎偄娲ゅù鐑芥偡閹捐秮褰掑礂闂傜繝瀛╅梺鎼炲€栫划鎾崇暦濠靛惟闁靛绠戦崜濠氭⒑濮瑰洤鐒洪柣鎾愁槺濡?
// 婵犵數鍋涢ˇ顓㈠礉瀹ュ绀堝ù鐓庣摠閺咁剚鎱ㄥΟ铏癸紞缂佺姷鎳撻埥澶愬箻瀹曞泦锛勭磼閸欐ê宓嗘慨濠呮椤撳ジ宕熼鐘橈綁鏌ｆ惔锝嗗殌妞わ富鍨跺畷锝堢疀濞戞鐣遍悷婊勭箘濡叉劕鈹戠€ｎ亞鍊為梺缁橆焾缁墽绮?CSP 濠电偛顕慨瀵哥矓閸洖绀夌憸鏃堝蓟閸涱収娼╃€规洖娲ㄩ悾?HTTP 闂備礁鎲＄换鍌滅矓鐎垫瓕濮抽柛娆忣槸缁剁偤鏌℃径瀣仸閻?meta 闂備礁鎼粔鏉懨洪妸鈺婃晢濡炲瀛╂刊濂告煕閹炬鎳忛悗?
// 闂佽崵濮崑鎾绘煥閺囨浜鹃梺纭咁嚋缁绘繂顕ｉ悽鍓叉晢闁告劦鍠氶崣鎰版煟閻樺弶鎼愰柣掳鍔屽嵄?"This warning will not show up once the app is packaged"
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冦亗閻旂厧鐏抽柧蹇ｅ亜娴犳挳鏌ｉ悢鍝ユ嚂缂佹煡绠栭幃妤呮偩鐏炴儳纾銈嗙墬濮樸劎绮ｉ悙鐑樼叆婵炴垶顭堢€氫即鏌?@note-studio 闂備礁鎼€氼喗鎱ㄩ幘顔藉剭闁绘绮弲?packages 闂備胶鍎甸弲鈺呭窗閺嶎偆绀?
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

const {
  initializeExtensions,
  settingsManager,
  workspaceManager,
  builtinAI,
  pluginEditorBridge,
  pluginDiscoveryService
} = require('./packages/main/dist/main/src/index.js');
const { ThemeService } = require('./packages/main/dist/main/src/services/ThemeService.js');
const { registerSettingsHandlers } = require('./packages/main/dist/main/src/ipc/settingsHandlers.js');
// 闂佽娴烽弫鎼佸储瑜斿畷锝夊幢濞嗘垹锛滈梺鍓插亖閸╁嫭瀵奸崒鐐寸厸闁割偅绻勫瓭婵犳鍠氶崰鏍箚閸曨厾鐭欓柛顭戝枛缂嶆ê鈹戦埥鍡楃仚闁逞屽墲濞呮洟宕?
const { TerminalService } = require('./packages/main/dist/main/src/services/terminal/index.js');
const { setTerminalService } = require('./packages/main/dist/main/src/ipc/terminalHandlers.js');
// 濠电偛鐡ㄧ划宥夊垂瑜版帩鏁?Embedding 闂備礁鎼悧鍡欑矓鐎涙ɑ鍙?
const { cloudEmbeddingService } = require('./packages/main/dist/main/src/services/CloudEmbeddingService.js');
const { getAllEmbeddingProviders, getEnabledEmbeddingModels } = require('./packages/main/dist/main/src/services/EmbeddingModelConfig.js');
// 闁诲氦顫夐幃鍫曞磿閹殿喚绀婇柡鍐ㄧ墕缁€宀勬煕濠靛棗顏柛濠傤煼濮婃椽骞撻幒鏃傤唺闂佺琚崝宀勵敋閿濆鍗抽柣鏂挎憸閻も偓闂?
const { workspaceVectorIndexService } = require('./packages/main/dist/main/src/services/WorkspaceVectorIndexService.js');

const logIconPath = path.join(__dirname, 'log', 'log.png');
const DEV_SERVER_URL = 'http://127.0.0.1:5173';
const DEV_SERVER_MAX_RETRIES = 8;
const DEV_SERVER_RETRY_DELAY_MS = 750;
const BOOKMARK_GROUP_PICKER_HTML_FILE = 'bookmark-group-picker.html';
const BOOKMARK_GROUP_PICKER_QUERY = {
  popup: 'bookmark-group-picker'
};
const privilegedSchemes = [
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
  },
  {
    scheme: 'wstudio-extension',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
];

function getProtocolModule() {
  return electron.protocol || session?.defaultSession?.protocol || null;
}
if (!fs.existsSync(logIconPath)) {
  console.warn('[Electron] 闂佸湱鍘ч悺銊ヮ潖婵犳艾鏋侀柕鍫濐槸閻愬﹪鏌ｉ幇闈涘闁搞劌銈搁弻锟犲醇椤愶紕鍑规繝銏ｎ潐閿曘垹鐣峰杈ㄦ殰妞ゆ柨澧介ˇ顔戒繆椤愶絾绶查悗姘煎灦椤㈡﹢宕妷锕€纾銈嗙墬濮樸劎绮?', logIconPath);
}

// 濠殿喗甯楃粙鎺椻€﹂崼銉晣濠电姵鑹剧憴锔姐亜閺嶃劎鐭嬮柡鍡楃箳閻ヮ亪顢樿閸樺憡绻涢崱鎰伈鐎规洘绻堥幃鈺呮倻閳轰椒澹曢梺缁樻礀閸婅崵绮堟径鎰拺妞ゆ巻鍋撻柣蹇旂箞瀹?Windows frameless 缂傚倷鐒﹂崝鏍€冮崨鑸汗婵炴垯鍨洪弲?resize 闂備礁鎼崯鍐测枖濞戙垹鍚规い鎾卞灪閸嬫繂霉閻撳寒鍤熼柟鏋姂楠炴牜鈧稒蓱缁€澶愭寠閻斿吋鍋ㄦい鏍ф缁夌數鈧?
// 濠电姷顣介埀顒€鍟块埀顒€鐏濋妴鎺楀醇閺囩偟顔婇梺鍦劋閹搁箖宕ｉ埀?GPU 闂備胶顭堢换鎺楀储瑜旈、娆撳箛閻楀牃鎷诲銈嗘磵閸嬫挻銇勯敐鍕煓闁轰礁绉舵禒锕傛寠婢跺寒鍞归梻鍌欑贰閸嬪懏绌遍搹瑙勫床闁告劦鍠楅崑婵囥亜閺嶃劌鍤柡鍡樻閺屾稑鈻庨幇鎯扳偓鍧楁煕閿濆懏鎯堟い鏇秮瀹曨偊宕熼銈呭箑闂備胶顭堢换鎴炵箾婵犲伣娑㈠箻椤旇姤娅?
if (process.env.NOTE_STUDIO_DISABLE_HARDWARE_ACCELERATION === 'true') {
  app.disableHardwareAcceleration();
  console.log('[Electron] Hardware acceleration disabled via env flag.');
} else {
  console.log('[Electron] Hardware acceleration remains enabled.');
}

// 婵犵數鍋涢ˇ顓㈠礉瀹€鍕埞濞寸姴顑嗛崵濠冦亜韫囨挸顏柡鍡樻緲閳藉寮▎鐐﹂悗瑙勬礃椤ㄥ牓骞忕€ｎ噮鏁婇柡鍕箳椤︿即姊虹紒姗嗘畽妞ゎ偄顦…鍥醇閵夈儳顢呴棅顐㈡处閸戝綊宕幘顔界叆婵炴垶顭囨晶鏇犵磼閻戔晛浜惧┑锛勫亼閸婃盯顢氳閿?app.whenReady 濠电偞鍨堕弻銊╊敄閸涱喗娅犻柣妯虹仛鐎氼剟鏌涢幇鍏哥凹闁哄棗绻橀弻?
// 闂佸搫顦弲婊堟偡閿曞倹鍋?local-file:// 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑欐綑缁犮儳鈧箍鍎遍悧鍡涘储閹绢喗鐓?<video>闂?audio>闂?img> 缂傚倷鐒︾粙鎴λ囨导瀛樺亯闁挎繂娲ㄦす鎶芥煕濞嗗秴鍔ラ柛姗嗗墯閹便劌鈹戦幘璺哄煂闂佺粯鐗為崺鏍箯閸涱垱宕夐柕濠忛檮濞?
const bootstrapProtocol = getProtocolModule();
if (bootstrapProtocol && typeof bootstrapProtocol.registerSchemesAsPrivileged === 'function') {
  bootstrapProtocol.registerSchemesAsPrivileged(privilegedSchemes);
  console.log('[Electron] Custom protocols registered.');
} else {
  console.warn('[Electron] Protocol privilege registration is unavailable during bootstrap.');
}

let mainWindow;
let terminalService = null;
const bookmarkGroupPickerSessions = new Map();
const sourceBookmarkGroupPickerMap = new Map();
const pendingOpenNoteWindowPayloads = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOpenNoteInNewWindowPayload(rawPayload) {
  const normalizedPath = typeof rawPayload?.path === 'string' ? rawPayload.path.trim() : '';
  if (!normalizedPath) {
    return null;
  }

  const normalizedName = typeof rawPayload?.name === 'string' && rawPayload.name.trim()
    ? rawPayload.name.trim()
    : path.basename(normalizedPath);
  const normalizedLanguage = typeof rawPayload?.language === 'string' && rawPayload.language.trim()
    ? rawPayload.language.trim()
    : 'plaintext';
  const normalizedLineNumber = Number.isFinite(rawPayload?.lineNumber) && rawPayload.lineNumber > 0
    ? Math.round(rawPayload.lineNumber)
    : undefined;
  const normalizedColumn = Number.isFinite(rawPayload?.column) && rawPayload.column > 0
    ? Math.round(rawPayload.column)
    : 1;

  return {
    path: normalizedPath,
    content: typeof rawPayload?.content === 'string' ? rawPayload.content : '',
    name: normalizedName,
    language: normalizedLanguage,
    lineNumber: normalizedLineNumber,
    column: normalizedColumn
  };
}

async function loadDevServerWithRetry(targetWindow, targetUrl = DEV_SERVER_URL, attempt = 1) {
  try {
    await targetWindow.loadURL(targetUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetriable = /ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_ABORTED/i.test(errorMessage);

    if (!isRetriable || attempt >= DEV_SERVER_MAX_RETRIES || !targetWindow || targetWindow.isDestroyed()) {
      console.error('[Electron] 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥附绻濋埀顒勫炊椤掆偓缁€澶愭煃閵夈劍鐝柣婵勫€濋弻娑㈠籍閸屾顒佺箾閺夋垶澶勭€垫澘瀚蹇涱敃閵?', errorMessage);
      throw error;
    }

    console.warn(`[Electron] 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥附绻濋埀顒勫炊椤掆偓缁€澶愭煃閵夈劍鐝柣婵勫€濋弻锟犲幢濡も偓閳ь剟顥撶划顓熷緞閹邦剛鐓戝銈嗙墬缁秹寮宠箛娑欑叆婵炴垶顭囬悘杈ㄣ亜?${attempt} 婵犵數鍋涘Λ瀵告崲濠靛闂柟闂寸劍閺? ${errorMessage}`);
    await sleep(DEV_SERVER_RETRY_DELAY_MS);
    await loadDevServerWithRetry(targetWindow, targetUrl, attempt + 1);
  }
}

function buildRendererUrl(htmlFileName = 'index.html', query = null) {
  const rendererUrl = new URL(htmlFileName, `${DEV_SERVER_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      rendererUrl.searchParams.set(key, value);
    }
  }

  return rendererUrl.toString();
}

async function loadRendererWindow(targetWindow, options = {}, openDevTools = false) {
  const {
    htmlFileName = 'index.html',
    query = null
  } = options;

  if (process.env.NODE_ENV === 'development') {
    await loadDevServerWithRetry(targetWindow, buildRendererUrl(htmlFileName, query));
    if (openDevTools && targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.openDevTools();
    }
    return;
  }

  const indexFilePath = path.join(__dirname, 'packages/renderer/dist', htmlFileName);
  if (query) {
    await targetWindow.loadFile(indexFilePath, { query });
    return;
  }

  await targetWindow.loadFile(indexFilePath);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBookmarkGroupPickerSize(rawValue, fallback, minValue, maxValue) {
  if (!Number.isFinite(rawValue)) {
    return fallback;
  }

  return clampNumber(Math.round(rawValue), minValue, maxValue);
}

function resolveBookmarkGroupPickerBounds(sourceWindow, request) {
  const sourceContentBounds = sourceWindow.getContentBounds();
  const anchorRect = request?.anchorRect ?? {};
  const anchorLeft = Number.isFinite(anchorRect.left) ? anchorRect.left : 0;
  const anchorTop = Number.isFinite(anchorRect.top) ? anchorRect.top : 0;
  const anchorWidth = Number.isFinite(anchorRect.width) ? anchorRect.width : 0;
  const anchorHeight = Number.isFinite(anchorRect.height) ? anchorRect.height : 0;
  const triggerScreenRect = {
    x: Math.round(sourceContentBounds.x + anchorLeft),
    y: Math.round(sourceContentBounds.y + anchorTop),
    width: Math.max(1, Math.round(anchorWidth)),
    height: Math.max(1, Math.round(anchorHeight))
  };
  const targetDisplay = screen.getDisplayMatching(triggerScreenRect);
  const { workArea } = targetDisplay;
  const popupWidth = normalizeBookmarkGroupPickerSize(
    Math.max(request?.minWidth ?? 0, triggerScreenRect.width),
    Math.max(triggerScreenRect.width, 240),
    220,
    Math.max(220, workArea.width - 16)
  );
  const popupHeight = normalizeBookmarkGroupPickerSize(
    request?.maxHeight,
    420,
    180,
    Math.max(180, workArea.height - 16)
  );
  const spacing = 4;
  const safeMargin = 8;
  const belowTop = triggerScreenRect.y + triggerScreenRect.height + spacing;
  const aboveTop = triggerScreenRect.y - popupHeight - spacing;
  const canOpenBelow = belowTop + popupHeight <= workArea.y + workArea.height - safeMargin;
  const canOpenAbove = aboveTop >= workArea.y + safeMargin;
  const nextTop = canOpenBelow || !canOpenAbove ? belowTop : aboveTop;
  const nextLeft = triggerScreenRect.x;

  return {
    width: popupWidth,
    height: popupHeight,
    x: clampNumber(
      nextLeft,
      workArea.x + safeMargin,
      Math.max(workArea.x + safeMargin, workArea.x + workArea.width - popupWidth - safeMargin)
    ),
    y: clampNumber(
      nextTop,
      workArea.y + safeMargin,
      Math.max(workArea.y + safeMargin, workArea.y + workArea.height - popupHeight - safeMargin)
    )
  };
}

function resolveBookmarkGroupPickerBackgroundColor(request) {
  return '#00000000';
}

function resolveBookmarkGroupPickerBackgroundEffect(popupWindow, request) {
  if (!request?.hasWorkbenchBackgroundImage) {
    return 'none';
  }

  if (process.platform !== 'win32') {
    return 'none';
  }

  if (!popupWindow || popupWindow.isDestroyed()) {
    return 'none';
  }

  if (typeof popupWindow.setBackgroundMaterial !== 'function') {
    return 'none';
  }

  return 'system-acrylic';
}

function applyBookmarkGroupPickerWindowAppearance(popupWindow, request) {
  const backgroundEffect = resolveBookmarkGroupPickerBackgroundEffect(popupWindow, request);

  popupWindow.setBackgroundColor(resolveBookmarkGroupPickerBackgroundColor(request));

  if (typeof popupWindow.setBackgroundMaterial === 'function') {
    try {
      popupWindow.setBackgroundMaterial(backgroundEffect === 'system-acrylic' ? 'acrylic' : 'none');
    } catch (error) {
      console.warn('[Electron] Failed to update bookmark group picker background material:', error);
      return 'none';
    }
  }

  return backgroundEffect;
}

function resolveBookmarkGroupPickerSession(popupWindowId, result = { status: 'cancelled', groupId: null }) {
  const sessionRecord = bookmarkGroupPickerSessions.get(popupWindowId);
  if (!sessionRecord) {
    return;
  }

  if (sessionRecord.resolved || typeof sessionRecord.resolve !== 'function') {
    return;
  }

  sessionRecord.resolved = true;
  const resolveSession = sessionRecord.resolve;
  sessionRecord.resolve = null;
  resolveSession(result);
}

function disposeBookmarkGroupPickerSession(popupWindowId, result = { status: 'cancelled', groupId: null }) {
  const sessionRecord = bookmarkGroupPickerSessions.get(popupWindowId);
  if (!sessionRecord) {
    return;
  }

  resolveBookmarkGroupPickerSession(popupWindowId, result);
  bookmarkGroupPickerSessions.delete(popupWindowId);
  if (sourceBookmarkGroupPickerMap.get(sessionRecord.sourceWindowId) === popupWindowId) {
    sourceBookmarkGroupPickerMap.delete(sessionRecord.sourceWindowId);
  }
}

function syncBookmarkGroupPickerWindow(sessionRecord, sourceWindow, request) {
  const popupWindow = sessionRecord?.popupWindow;
  if (!popupWindow || popupWindow.isDestroyed()) {
    return;
  }

  const popupBounds = resolveBookmarkGroupPickerBounds(sourceWindow, request);
  const backgroundEffect = applyBookmarkGroupPickerWindowAppearance(popupWindow, request);
  const nextState = {
    ...request,
    backgroundEffect
  };

  sessionRecord.request = nextState;
  popupWindow.setBounds(popupBounds);

  if (sessionRecord.isReady && popupWindow.webContents && !popupWindow.webContents.isDestroyed()) {
    popupWindow.webContents.send('bookmark-group-picker:state-changed', nextState);
  }
}

function showBookmarkGroupPickerWindow(sessionRecord) {
  const popupWindow = sessionRecord?.popupWindow;
  if (!popupWindow || popupWindow.isDestroyed()) {
    return;
  }

  if (!sessionRecord.isReady) {
    sessionRecord.pendingShow = true;
    return;
  }

  sessionRecord.pendingShow = false;
  popupWindow.show();
  popupWindow.focus();
}

function hideBookmarkGroupPickerWindow(popupWindowId, result = { status: 'cancelled', groupId: null }) {
  const sessionRecord = bookmarkGroupPickerSessions.get(popupWindowId);
  if (!sessionRecord) {
    return;
  }

  sessionRecord.pendingShow = false;
  resolveBookmarkGroupPickerSession(popupWindowId, result);
  const popupWindow = sessionRecord.popupWindow;
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.hide();
  }
}

function createBookmarkGroupPickerWindow(sourceWindow) {
  const popupBounds = resolveBookmarkGroupPickerBounds(sourceWindow, null);
  const popupWindow = new BrowserWindow({
    ...popupBounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    parent: sourceWindow,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: false,
    backgroundMaterial: 'none',
    backgroundColor: resolveBookmarkGroupPickerBackgroundColor(null),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  });
  setWindowsAccentBorder(popupWindow, false);

  popupWindow.on('blur', () => {
    hideBookmarkGroupPickerWindow(popupWindow.id);
  });

  popupWindow.on('closed', () => {
    disposeBookmarkGroupPickerSession(popupWindow.id);
  });

  return popupWindow;
}

function ensureBookmarkGroupPickerSession(sourceWindow) {
  const existingPopupId = sourceBookmarkGroupPickerMap.get(sourceWindow.id);
  if (existingPopupId) {
    const existingSession = bookmarkGroupPickerSessions.get(existingPopupId);
    const existingWindow = existingSession?.popupWindow;
    if (existingSession && existingWindow && !existingWindow.isDestroyed()) {
      return existingSession;
    }

    disposeBookmarkGroupPickerSession(existingPopupId);
  }

  const popupWindow = createBookmarkGroupPickerWindow(sourceWindow);
  const sessionRecord = {
    popupWindow,
    request: null,
    resolve: null,
    resolved: true,
    sourceWindowId: sourceWindow.id,
    isReady: false,
    pendingShow: false
  };

  bookmarkGroupPickerSessions.set(popupWindow.id, sessionRecord);
  sourceBookmarkGroupPickerMap.set(sourceWindow.id, popupWindow.id);

  void loadRendererWindow(popupWindow, {
    htmlFileName: BOOKMARK_GROUP_PICKER_HTML_FILE,
    query: BOOKMARK_GROUP_PICKER_QUERY
  }).then(() => {
    const nextSessionRecord = bookmarkGroupPickerSessions.get(popupWindow.id);
    if (!nextSessionRecord || popupWindow.isDestroyed()) {
      return;
    }

    nextSessionRecord.isReady = true;
    if (nextSessionRecord.request) {
      syncBookmarkGroupPickerWindow(nextSessionRecord, sourceWindow, nextSessionRecord.request);
    }
    if (nextSessionRecord.pendingShow) {
      showBookmarkGroupPickerWindow(nextSessionRecord);
    }
  }).catch((error) => {
    console.error('[Electron] Failed to load bookmark group picker window:', error);
    disposeBookmarkGroupPickerSession(popupWindow.id);
    if (!popupWindow.isDestroyed()) {
      popupWindow.destroy();
    }
  });

  return sessionRecord;
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

function setWindowsAccentBorder(targetWindow, shouldHighlight) {
  if (process.platform !== 'win32' || !targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (typeof targetWindow.setAccentColor !== 'function') {
    return;
  }

  try {
    targetWindow.setAccentColor(shouldHighlight);
  } catch (error) {
    console.warn('[Electron] Failed to update Windows accent border state:', error);
  }
}

function registerWindowsAccentBorderSync(targetWindow) {
  if (
    process.platform !== 'win32'
    || !targetWindow
    || targetWindow.isDestroyed()
    || !systemPreferences
    || typeof systemPreferences.on !== 'function'
    || typeof systemPreferences.removeListener !== 'function'
  ) {
    return;
  }

  const syncAccentBorder = () => {
    setWindowsAccentBorder(targetWindow, targetWindow.isFocused());
  };

  systemPreferences.on('color-changed', syncAccentBorder);
  systemPreferences.on('accent-color-changed', syncAccentBorder);
  targetWindow.on('focus', syncAccentBorder);
  targetWindow.on('blur', syncAccentBorder);

  targetWindow.once('closed', () => {
    systemPreferences.removeListener('color-changed', syncAccentBorder);
    systemPreferences.removeListener('accent-color-changed', syncAccentBorder);
  });
}

/**
 * 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎯ь嚟閳绘棃鏌ゆ慨鎰偓妤€鐣烽崼鏇熺叆?
 * @param {string} backgroundColor - 缂傚倷鐒﹂崝鏍€冮崨鑸汗婵炴垯鍨洪崵鍕倶閻愰潧浜鹃柣婵愬灦閺屻倗娑甸崪浣告疂缂備浇椴搁悷鈺侇嚕閸洖唯闁靛鍎查鍥偡濠婂懎顣奸柟绋挎啞閺呭爼鎮╁畷鍥ｆ灃婵犵數濮甸崙褰掑汲椤栫偞鐓?
 */
function createWindow(backgroundColor = '#1e1e1e', options = {}) {
  const startupQuery = options && typeof options === 'object' && options.query
    ? options.query
    : null;
  const createdWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    minWidth: 300,
    minHeight: 600,
    frame: false, // 闂備礁鎼崯鐗堟叏閸撗呭崥闁绘柨顨庡ù鏍煕閳╁啰鎳呯€规洖鐖奸弻?
    titleBarStyle: 'hidden',
    thickFrame: true,
    accentColor: true,
    backgroundColor: backgroundColor, // 濠电偠鎻紞鈧繛澶嬫礋瀵偊濡堕崱娆屾灃婵犵數濮甸崙褰掑汲椤栫偞鐓犻柛鎰级濠€鐗堢箾閸涱喚鎳囬柟铏箘閹风姾顦寸紒鈧径鎰拺妞ゆ巻鍋撻柣蹇旂箞瀹曘垽濡舵径瀣壃闂佺锕﹂崰搴ㄋ夎箛娑欌拻闁稿被鍊撶花浠嬫煕?
    icon: logIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true, // 闂備礁鎲￠崙褰掑垂閹惰棄鏋?webview 闂備礁鎼粔鏉懨洪妸鈺婃晢闁绘垼濮ら弲顒傗偓鍏夊亾闁逞屽墴瀵偊濡堕崱娆樻锤闁硅壈鎻槐鏇㈠Χ閻㈠憡鐓曢煫鍥ь儏閸斻儲銇勯銏╁剱闁挎稒鍔欓獮瀣倷閺夋垵鏅╅梻浣姐€€閸嬫捇鏌熼鍡楀瑜?
      backgroundThrottling: false // 缂傚倷绀侀崐鐑芥嚄閸洖鏋侀柕鍫濐槸鐟欙箓骞栫划鍏夊亾閹惰棄褰欓梻浣哄帶閹碱偊宕愰崷顓犵焾闁挎洖鍊归弲顒傗偓鍏夊亾闁逞屽墴閸ㄦ儳螣閼姐倐鏀冲┑鐘绘涧閻楀繘鎯岄幒鏃傜＜闁哄啯鍨甸悘鐘绘煕濡崵鐭掔€殿喕绮欏畷鍫曨敆娓氬﹦纭€闂備胶绮崹鎶芥倿閿曞偆鏁嗘繝濠傜墛閺?
    }
  });

  mainWindow = createdWindow;
  pluginEditorBridge.setMainWindow(createdWindow);
  setWindowsAccentBorder(createdWindow, createdWindow.isFocused());
  registerWindowsAccentBorderSync(createdWindow);

  createdWindow.once('ready-to-show', () => {
    if (!createdWindow.isDestroyed()) {
      createdWindow.show();
    }
  });

  // 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥箓鎳氶埡鍐ｅ亾濞堝灝鏋涘Δ鐘茬箳濡叉劖瀵奸弶鎴狀槷闂佺粯顭囬崕銈囩矈?Vite 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥附绻濋埀顒勫炊椤掆偓缁€澶愭煃閵夈劍鐝柣?
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
    console.log(`[Electron] 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥箓鎳氶埡鍐ｅ亾濞堝灝鏋涘Δ鐘茬箳濡叉劖瀵奸弶鎴狀槷闂佺粯顭囬崕銈囩矈?Vite 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟繛鍡樺姇閻忥附绻濋埀顒勫炊椤掆偓缁€澶愭煃閵夈劍鐝柣?${DEV_SERVER_URL}`);
    void loadRendererWindow(createdWindow, { query: startupQuery }, true);
  } else {
    // 闂備焦鐪归崹濠氬窗瀹ュ棭娈介柛銉仜閻旂厧鐏崇€规洖娲ㄩ、鍛存⒑閹稿海鈯曢柤鍦亾閹便劑鎮欑€涙ê顫￠梺鍏间航閸庢娊鍩€椤掑鐏犳い鏇熺懇瀹曨偊宕熼鈧埀顒傛暬閺岋綁濡搁妷銉痪闂佸搫顑呴崯鎾极?
    console.log('[Electron] Production mode: loading built renderer files.');
    void loadRendererWindow(createdWindow, { query: startupQuery });
  }

  createdWindow.on('closed', () => {
    pendingOpenNoteWindowPayloads.delete(createdWindow.id);

    if (resizeStateResetTimer) {
      clearTimeout(resizeStateResetTimer);
      resizeStateResetTimer = null;
    }

    if (mainWindow === createdWindow) {
      const fallbackWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) || null;
      mainWindow = fallbackWindow;
      workspaceVectorIndexService.setMainWindow(fallbackWindow);
      pluginEditorBridge.setMainWindow(fallbackWindow);
    }
    // 婵犵數鍋為幐鎼佸箠濡　鏋嶉幖娣妼鐟欙箓鏌熸潏鍓х暠婵炲懌鍊楃槐鎺撶瑹閸喚浠肩紓浣瑰閺呯姴顕ｉ棃娑卞悑闁告侗鍙庡鎶芥⒑濮瑰洤濡奸悗姘煎櫍閹即濡烽埡浣虹厬闂佹寧绻傞幊鎰矚閸ф鐓?
    
  });

  // 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冪☉鐟欙箓鏌熸潏鍓х暠婵炲懌鍊楃槐鎺撶瑹閸喚浠肩紓浣瑰閺呯姴顕ｉ棃娑卞悑闁告侗鍙庡鎶芥⒑濮瑰洤濡奸悗姘间簽閳ь剟娼ч惉鑲╁垝閿濆憘鏃堝焵椤掑啨浜规繛鎴烇供閸ゆ洟鏌￠崶鈺佇ｉ柡鍡楃箻閺屻劌鈽夊Ο鐓庘叡闂佽桨闄嶉崐鏍矉瀹ュ棙鍎熼柍銉ョ－瀹€娑㈡⒒娓氬洤浜楁繛鏉戞川閹广垹螣缂佹ê鍔呴梺鎸庢濞夋洟鎯冮幋婢濆綊鎮╂笟顖氭櫍缂?
  workspaceVectorIndexService.setMainWindow(createdWindow);

  // F12 闂傚倸鍊搁幊搴ｆ崲閹存繍娓婚柛宀€鍋涚粻銉╂煙閹咃紞缁?DevTools闂備焦瀵х粙鎴︽偋婵犲洤钃熼柣鏂挎憸閻熷綊鏌ら幇浣哥仯婵炲牆鐖奸幃褰掑炊閵婏妇鈹涚紓?
  createdWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') {
      createdWindow.webContents.toggleDevTools();
    }
  });

  // 闂備胶鍎甸弲婊堝垂閻㈢绠氬璺侯焾閳ь剚甯″畷锝嗗緞鐏炶棄鑴梺鍝勵槴閺呮粎绮欓幘璇茬厺闁绘挸娴烽弳锕傛煃閸濆嫬鈧鎯?
  createdWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] 婵犵數鍋為幐绋款嚕閸洘鍋傞悗锝庡亝娴溿倖绻涢幋鐐茬劰闁哄被鍊楅埀顒冾潐濞插秹寮插鍛板С?', details.reason, details.exitCode);
  });
  createdWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) { // warning=2, error=3
      console.error(`[Renderer] ${message} (${sourceId}:${line})`);
    }
  });
  
  // 闂備胶鍎甸弲婊堝垂閻㈢绠氬璺虹灱閻滅粯淇婇妶鍌氫壕閻熸粎澧楅惄顖炲箖閻愮儤鏅滈柟顖嗗倸瀵查梻浣告啞閻燂箓鏁嬮柣?
  const syncWindowMaximizedState = () => {
    createdWindow.webContents.send('window-maximized-state-changed', createdWindow.isMaximized());
  };

  createdWindow.on('focus', () => {
    mainWindow = createdWindow;
    pluginEditorBridge.setMainWindow(createdWindow);
    createdWindow.webContents.send('window-focus');
  });
  
  createdWindow.on('blur', () => {
    createdWindow.webContents.send('window-blur');
  });

  createdWindow.on('maximize', syncWindowMaximizedState);
  createdWindow.on('unmaximize', syncWindowMaximizedState);
  
  // 缂傚倷鐒﹂崝鏍€冮崨鑸汗婵炴垯鍨圭粈澶愭煟濡厧鍔嬬紒浣峰嵆閹鎮烽悧鍫熸嫳闂佹悶鍔嶅畝绋跨暦閵夛附鍎熼柨婵嗘閺嗙姵绻濋姀锝嗙【閻庢凹鍣ｉ獮?
  createdWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Renderer did-finish-load.');
    syncWindowMaximizedState();
    // 婵犵數鍋涢ˇ顓㈠礉瀹ュ绀堝ù鐓庣摠閺咁剚鎱ㄥ┑鍫熸櫩in-process:ready 濠电偛鐡ㄧ划宀勵敄閸曨偀鏋庨柕蹇嬪€栭弲?initializeExtensions 闂佽娴烽幊鎾诲嫉椤掑嫬鍨傛慨妯挎硾鐟欙箓骞栫划鍏夊亾瀹曞洤鐭濋梻鍌欑贰閸嬪倻娆㈤妶鍥潟婵犻潧娲ㄩ埢鏃傗偓骞垮劚閹冲繘鐓鍕骇闁冲搫鍊婚幊鍥煕閿濆洤鍘寸€规洩缍侀獮瀣敍濞戞﹩浼?
  });

  return createdWindow;
}

/**
 * 闂佸湱鍘ч悺銊ヮ潖婵犳艾鏋侀柕鍫濇川閻瑩鎮楅敐搴濈敖缁炬澘绉归幃妯跨疀濮橆偄鎯堥梺鍛婎殔闁帮絽鐣烽妷锔藉劅闁炽儱纾禒瀛樼節濞堝灝鏋涙い鎴濇噽閳?
 */
app.whenReady().then(async () => {
  
  // 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩兩戦崕鐔兼煛閸愩劌鈧綊寮宠箛娑欑厾闁圭娴烽惌濠勨偓瑙勬礈閸犳牠寮鍥︽勃闁兼亽鍎遍崜濠氭⒑濞茬粯濞囬柛鏂跨Ч閹儵鏁愭径濠勵槱闂佺硶鍓濋悷褍顪冩禒瀣骇闁割偆鍠庨悘銉╂煙閻戔晜娅婃鐐村灴閹粓鎳為妷锔筋唵闂備焦瀵х粙鎴濓耿閹插澁l+X/C/V/A/Z闂?
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
  
  // 闂備胶顭堢换鍫ュ礉瀹€鍕剳妞ゆ帒鍊规刊濂告煕閹炬鎳忛悗?Content Security Policy (CSP)
  // 闂傚鍋勫ú銈夊箠濮椻偓婵＄绠涘☉妯诲祶闂侀潧顭堥崕閬嶆倶閿涘嫧鍋撻悙鐟扳偓娑樷枍閿濆鍋橀柕澶嗘櫅閻鏌ㄥ┑鍡楊伀妞ゆ挻妞介弻娑㈠箻瀹曞泦銉︺亜閺冣偓濞叉粎妲愰弮鍫晪闁糕剝鐟чˇ顔界箾鐎电袨闁稿孩濞婇崹鎯熼懡銈傛敵濠电娀娼уú銈夈€傞弻銉︾厸闁割偅绻嶅Σ鍏笺亜閺囥劌澧弫鍫ユ煕瀹€鈧崑娑㈠储閹绢喖绠归悗娑櫳戦埛鎺楁煛?CSP
  const defaultSession = session.defaultSession;
  
  // 闂佽姘﹂～澶愭儗椤斿墽涓?CSP 缂傚倷鐒︾粙鎺楁偋濠婂牆姹?
  // 婵犵數鍋涢ˇ顓㈠礉瀹ュ绀堝ù鐓庣摠閺咁剚鎱ㄥΟ鑽ゆ▊闁冲搫鎳忛弲?unsafe-eval 闂備礁鎲￠悷顖炲垂閻㈢绀傛俊顖濐嚙椤曡鲸鎱ㄥ鍡楀妞ゃ劍鐩弻?Vite HMR闂備焦瀵х粙鎴︽嚐椤栫偑鈧懓顦圭€殿喚顭堥…銊╁醇濠婂嫭宕抽梻浣告啞鐢﹪宕￠崘鍙傛盯鎳滅喊澶岀煑濠碘槅鍨遍娆撳吹閻愮儤鐓欐い鎾寸矊閻忊晜銇?
  // 闂備焦鐪归崹濠氬窗瀹ュ棭娈介柛銉仜閻旂厧鐏崇€规洖娲ㄩ、鍛存⒑閹稿海鈯曟慨妯稿妺缁ㄦ椽姊?unsafe-eval闂備焦瀵х粙鎴﹀嫉椤掆偓鐓ら悹鎭掑妷閸嬫捇鎮烽柇锔叫﹂梺?
  // 闂備胶顭堢换瀣归崶顒夋晩闊洦绋掗弲?jsdelivr CDN 闂備礁鎲″缁樻叏閹灐?Monaco Editor 闂備胶鍘ч悺銊у枈瀹ュ拑鑰?
  // frame-src 闂備胶顭堢换瀣归崶顒夋晩闊洦绋戠粈澶愭煟濡厧鍔嬬紒浣峰嵆閹嘲鈻庤箛鏃戞＆濡炪倧绲介悥濂告偘椤曗偓瀹曟﹢骞撻幒妤€褰欓梻浣圭湽閸斿瞼鈧凹鍓涚划濠囨偨缁嬭法顦ч梺闈涱檧闂勫嫮浜搁敓鐘崇厸闁逞屽墴楠炲棜顦抽柣婵勫€濋弻銊モ槈濡崵顔囩紓鍌欑劍濮婂綊鎮烽敐澶婄劦妞ゆ垼娉曢悿鍣妘Tube闂備線娼уΛ鏂款渻閹烘梹顫曟い鎾卞灪閻撯偓闂佸憡鍨崐妤冪矆?
  const cspHeader = process.env.NODE_ENV === 'development'
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:* https://cdn.jsdelivr.net; worker-src 'self' blob: http://localhost:* ws://localhost:* https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file: wstudio-extension:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' wstudio-extension: https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file: wstudio-extension:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' wstudio-extension: https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';";
  
  // 闂備胶鎳撻崵鏍⒔閸曨垰鏄ラ柛娑欐綑缁犮儵鏌嶈閸撶喎顕ｉ崹顐㈢窞濠电姴鍟崕銉╂煙閻撳海鎽犻柡灞诲姂閹崇喖鎮㈤棃鐐叉捣閹风娀骞撻幒婵囧 CSP 闂?
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
  
  // 婵犵數鍋涢ˇ顓㈠礉瀹€鍕埞濞寸姴顑嗛崵濠冦亜韫囨挸顏柡鍡樻緲閳藉寮▎鐐﹂悗瑙勬礃椤ㄥ牓骞忕€ｎ噮鏁婄痪鎷岄哺琚╅梻浣藉吹閸嬫稑螞濡ゅ懎鍚归梺顒€绉甸弲?
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
    console.log('[Electron] 缂傚倷绀侀ˇ顖炩€﹀畡鎵虫瀺閹兼番鍔岀涵鈧棅顐㈡处閸戝綊宕幘顔界厱闁规儳纾倴缂備浇椴搁崹鍨暦椤忓棔娌柛鎾楀啫缁╅梺鑽ゅТ濞层垽宕归悷閭﹀殨妞ゆ帒瀚弸渚€鏌℃径瀣嚋闁?', url);

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

  // 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉墮濡﹢鏌涢妷顖炴妞ゆ劒绮欓弻?MIME 缂傚倷绶￠崑澶愵敋瑜旈幃?
  const getMimeType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      // 闂佽崵鍠愰悷銉ノ涘┑瀣ㄢ偓?
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.ogv': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      // 闂傚倸鍊搁敃銉︾箾婵犲洢鈧?
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      // 闂備焦鎮堕崕杈ㄦ櫠閼恒儲娅?
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      // 闂備胶顭堢换鎴濓耿閸︻厼鍨?
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  };

  const isPathInsideRoot = (rootDirectory, targetPath) => {
    const relativePath = path.relative(rootDirectory, targetPath);
    return relativePath.length > 0
      && !relativePath.startsWith('..')
      && !path.isAbsolute(relativePath);
  };

  const resolveExtensionAssetPath = (requestUrl) => {
    try {
      const parsedUrl = new URL(requestUrl);
      const extensionId = decodeURIComponent(parsedUrl.hostname);
      if (!extensionId) {
        return null;
      }

      const descriptor = pluginDiscoveryService.getById(extensionId);
      if (!descriptor) {
        return null;
      }

      const relativeAssetPath = parsedUrl.pathname
        .split('/')
        .filter(segment => segment.length > 0)
        .map(segment => {
          try {
            return decodeURIComponent(segment);
          } catch (error) {
            return segment;
          }
        })
        .join(path.sep);

      if (!relativeAssetPath) {
        return null;
      }

      const resolvedAssetPath = path.resolve(descriptor.rootDirectory, relativeAssetPath);
      if (!isPathInsideRoot(descriptor.rootDirectory, resolvedAssetPath)) {
        return null;
      }

      return resolvedAssetPath;
    } catch (error) {
      console.error('[Electron] Failed to resolve wstudio-extension asset path:', error);
      return null;
    }
  };

  const handleFileProtocol = (protocolName) => (request, callback) => {
    console.log(`[Electron] ${protocolName} 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑卞灡鐎氭岸姊洪崹顕呭剳婵犫偓?`, request.url);
    
    try {
      let resolvedPath;
      
      // 闂備胶鍎甸弲娑㈡偤閵娧勬殰闁圭虎鍠楅弲?URL 濠电偞鍨堕幖鈺呭储閸婄喆浜瑰〒姘ｅ亾鐎规洩缍佸浠嬵敆閸屾粌鏁堕梻?
      let urlPath = request.url;
      
      // 缂傚倷绀侀ˇ顖炩€﹀畡鎵虫瀺閹兼番鍔岀涵鈧棅顐㈡处閸戝綊宕幘顔界厱闁规儳纾倴缂?(local-file:// 闂?local-file:///)
      if (protocolName === 'local-file') {
        urlPath = urlPath.replace(/^local-file:\/\/\/?/, '');
      } else if (protocolName === 'vscode-file') {
        urlPath = urlPath.replace(/^vscode-file:\/\/vscode-app\/?/, '');
      }
      
      // 缂傚倷绀侀ˇ顖炩€﹀畡鎵虫瀺閹兼番鍔岄拑鐔兼煏婢舵鍘涢柛銈呭閺屾稑鈻庤箛鎾亾瑜版帒姹查柣鏃傚帶濡炰粙鎮橀悙璺盒撻柟顖涘姍閺?
      const queryIndex = urlPath.indexOf('?');
      const hashIndex = urlPath.indexOf('#');
      if (queryIndex !== -1) urlPath = urlPath.substring(0, queryIndex);
      if (hashIndex !== -1) urlPath = urlPath.substring(0, hashIndex);
      
      // URL 闂佽崵鍠愰悷杈╁緤閸ф鍋夋繝濠傜墕閺嬩胶绱撻崼銏犫枅闁搞倕顑夐幃瑙勭瑹椤栨氨浠╃紓?
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch (e) {
        // 濠电姷顣介埀顒€鍟块埀顒€缍婇幃妯诲緞閹邦剚鐎紓鍌氱墢婵绮旀總鍛婂仭婵炲棙鐟ч幃濂告煟閺嶃劎鐭嬬€垫澘瀚蹇涱敃閵夋劖娲熼弻銊モ槈濡灝顏梺姹囧妼婢т粙骞忛悩璇插嵆闁冲灈鏅涙禍楣冩煙閻楀牊绶查柛鏂诲劦閺屾盯骞掗幋鐑嗘％閻炴碍鐟╅弻?
        const parts = urlPath.split('/');
        urlPath = parts.map(part => {
          try {
            return decodeURIComponent(part);
          } catch (e) {
            return part;
          }
        }).join('/');
      }
      
      console.log(`[Electron] URL闂佽崵鍠愰悷杈╁緤閸ф鍋夋繝濠傜墛閺?`, urlPath);
      
      // Windows 闂佽崵濮崇拃锕傚垂閹殿喗顐介柣鎰綑缁剁偤鏌涢弴銊ュ箺闁?
      if (process.platform === 'win32') {
        // 濠电姰鍨煎▔娑氣偓姘煎櫍楠?/C:/... 闂備礁鎼粔鍫曞储瑜忓Σ?
        if (/^\/[A-Za-z]:/.test(urlPath)) {
          urlPath = urlPath.substring(1);
        }
        // 濠电姰鍨煎▔娑氣偓姘煎櫍楠?c/Users/... 闂備礁鎼粔鍫曞储瑜忓Σ鎰版晸閻樿櫕娅栭梺鍓插亞閸犳捇濡舵繝姘仭婵炲棗绻掓晶鏇熺箾閸涱喖娴€规洩缍侀、娑樷攽閸℃绠ｅ┑鐐存綑閸氬顫濋妸銈囨槀闂傚倸鍊哥€氥劑宕愰弴銏犵柈閻庯綆鍠栭惌妤呮煕閹存瑥鈧绮?
        // 婵犵妲呴崑鈧柛瀣尰缁绘盯寮堕幋顓炲壉濠碘€冲级閹倸鐣烽妷鈺傛櫆闁兼亽鍎?"闂備胶鍎甸弲婊堚€﹂崶顒夋晞?Users" 闂?"闂備胶鍎甸弲婊堚€﹂崶顒夋晞?..." 闂備焦鐪归崝宀€鈧凹鍙€閸燁垶姊?
        else if (/^[A-Za-z]\//.test(urlPath)) {
          // 闂備線娼荤拹鐔煎礉鎼粹埗楦跨疀閺囩姷鐣堕梺鎸庢磵閸嬫捇鏌熼绛嬫當閼挎劙鎮归崶銊ョ祷妞ゎ偓缍侀弻娑㈠箛椤撶偟鐟ㄩ悷? c/Users -> C:/Users
          urlPath = urlPath.charAt(0).toUpperCase() + ':' + urlPath.substring(1);
        }
        
        // 缂備胶铏庨崣搴ㄥ窗閺囩姵宕叉慨妯垮煐閸庡孩淇婇婧炬嫛闁稿骸锕ら…鍧楀醇閸℃鏆欓柡?
        if (/^[a-z]:/.test(urlPath)) {
          urlPath = urlPath.charAt(0).toUpperCase() + urlPath.substring(1);
        }
      }
      
      // 闂佸搫顦遍崕鎰板礈濮橆剛鏆﹂柛娆忣槺閳绘棃鏌ц箛鎾剁Ш闁稿繐娲ㄧ槐鎾存媴閸濆嫭鐏嗛梺娲诲幗閸庢娊顢氶妷鈺佺妞ゆ帒鍊搁ˉ鏇㈡⒑?
      resolvedPath = path.normalize(urlPath);
      
      console.log(`[Electron] 闂佽崵鍠愰悷杈╁緤妤ｅ啯鍊靛ù鐘差儏鐟欙箓骞栨潏鍓хɑ闁伙綁浜堕弻锟犲磼濮橆厾鐓戝┑鐐叉閸ㄥ骞戦崟顖ｆ晬婵浜悰?`, resolvedPath);
      
      // 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑闂佸搫顑呴崯顖滅矉閹烘鍤嬮柛顭戝€ｉ敃鍌涚厱婵ê澧介悾閬嶆煟鎺抽崝鎴﹀极?
      if (fs.existsSync(resolvedPath)) {
        const mimeType = getMimeType(resolvedPath);
        console.log(`[Electron] 闂備礁鎼崐绋棵洪敐鍛瀻闁靛繆鎳囬崑鎾斥槈濞咁収浜滈敃銏ゎ敂閸喐娅栭柣搴緱濠€濉嶦缂傚倷绶￠崑澶愵敋瑜旈幃?`, mimeType);
        return callback({ 
          path: resolvedPath,
          mimeType: mimeType
        });
      } else {
        console.log(`[Electron] 闂備礁鎼崐绋棵洪敐鍛瀻闁靛骏绱曢埢鏃傗偓骞垮劚閹虫劙骞楅悩缁樼叆?`, resolvedPath);
        return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      }
    } catch (error) {
      console.error(`[Electron] 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑卞枛缁剁偤鏌涢弴銊ュ箺闁稿﹦鍋ゅ娲箰鎼达絾鍣?`, error);
      return callback({ error: -2 }); // net::ERR_FAILED
    }
  };

  const handleExtensionAssetProtocol = (request, callback) => {
    try {
      const resolvedPath = resolveExtensionAssetPath(request.url);
      if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return callback({ error: -6 });
      }

      return callback({
        path: resolvedPath,
        mimeType: getMimeType(resolvedPath)
      });
    } catch (error) {
      console.error('[Electron] Failed to handle wstudio-extension protocol request:', error);
      return callback({ error: -2 });
    }
  };
  
  // 婵犵數鍋涢ˇ顓㈠礉瀹€鍕埞?local-file:// 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑樼摠閸嬨劑鏌曟繛鍨偓妤呮嚌妤ｅ啯鐓曢柡鍐ㄥ€搁瀷濠电偞娼欏ú顓烆嚕閻㈠壊鏁嗛柍褜鍓欓敃銏ゅ箻椤斿吋顥濋梺鎼炲劵闂勫嫰顢?
  const protocolModule = getProtocolModule();
  if (!protocolModule || typeof protocolModule.registerFileProtocol !== 'function') {
    throw new Error('[Electron] Protocol registration API is unavailable.');
  }

  protocolModule.registerFileProtocol('local-file', handleFileProtocol('local-file'));
  // console.log('[Electron]  local-file:// 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑卞弾閸熷懘鏌涘▎蹇ｆЧ闁哄棗鐗撻弻?);
  
  // 婵犵數鍋涢ˇ顓㈠礉瀹€鍕埞?vscode-file:// 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑卞枟婵瓨绻濇繛鎯т壕闁荤姵鍔楅崰鎰嚗閸曨垰鐐婇柍鍝勫€瑰▓銏ゆ⒑閹稿海鈽夐柣妤€妫濆畷銉р偓锝庡厴閸嬫挾娑甸崪浣圭秷濠碘槅鍋掗崑濠囧箖瑜斿畷濂告偄鐏忎焦瀵橀梺璇茬箳閸嬬偛煤閳哄啯顫?
  protocolModule.registerFileProtocol('vscode-file', handleFileProtocol('vscode-file'));
  // console.log('[Electron]  vscode-file:// 闂備礁鎲￠〃鍛崲濡ゅ拋鏁婇柛娑卞弾閸熷懘鏌涘▎蹇ｆЧ闁哄棗鐗撻弻?);

  protocolModule.registerFileProtocol('wstudio-extension', handleExtensionAssetProtocol);
  
  // 闂?闂備胶顭堢换鎰版偋閸℃稑鍨傞柛顭戝亝閸欏繘鎮楅敐搴濈盎妞ゆ泦鍥ㄧ厵缁剧増蓱濞呭懘鏌ｉ銏⑿ら柛鏍ㄧ墵閹筹繝濡堕崶褏鍘烽梻浣瑰缁嬫垿鎮ф繝鍥ф瀬闁绘劕鎼粈鍐倶閻愭潙鍔ゆい锝嗙叀閺?IPC 濠电姰鍨煎▔娑氣偓姘煎櫍楠炲啯绻濋崶褔妫峰銈庡幗鐢偟绮?
  // 婵犵數鍋涢ˇ顓㈠礉瀹ュ绀堝ù鐓庣摠閺咁剚鎱ㄥ鍡楀缂佺姵鍨甸—鍐Χ閸偄娈┑鐘亾妞ゅ繐鐗嗙粈鍡樼箾閹寸儐鐒界紒鎲嬪缁辨帡骞囬褎鐣堕悷婊呭缁嬫帞绮欐繝鍕ㄥ亾閿濆簼绨绘い銈呮噺缁绘稒寰勯崼婵嗩瀳闂?IPC 濠电姰鍨煎▔娑氣偓姘煎櫍楠炲啯绻濋崶褔妫峰銈庡幗鐢偟绮堟径鎰厱婵ê澧介悾閬嶆煕椤垵鐏犻柕鍡樺浮瀹曪絾寰勭仦钘夎劘闂佸搫顦弲婊呯矙閹捐鐓濋柛蹇曞帶椤曡鲸鎱ㄥ鍡楀箺闁哄棭浜弻?"No handler registered" 闂傚倷鐒︾€笛囨偡閵娾晩鏁?
  try {
    await initializeExtensions(null); // 闂備礁鎼Λ妤呭磹閻熼偊娓婚柛灞剧〒閳绘梻鈧箍鍎辩€氼噣鎮欐繝鍥ㄢ拺妞ゆ劧绲界粭褔鏌ｅ☉鏍у姦鐎规洩缍侀弫鎰疀閺囩媭妲烽梻浣侯焾缁绘劙鎮ф繝鍥ф瀬闁绘劗鍎ら弲?IPC 濠电姰鍨煎▔娑氣偓姘煎櫍楠炲啯绻濋崶銊︽?
    
    // 濠电偠鎻紞鈧繛澶嬫礋瀵偊濡堕崱鈺備粯濠碘槅鍨遍娆撳触閸ヮ剚鐓犻柛鎰级濠€鐗堢箾閸涱喚鎳囬柟铏箘閹风姾顦寸紒鈧崟顐熸闁圭偓鍓氶悡鍏笺亜閿濆嫮鐭欓柟顔垮Г濞煎繘濡搁…鎴炶埞闂備礁鎼張顒勫箲娴ｇ儤宕叉俊顖濆亹閻瑩鎮楅敐搴″⒒闁告埃鍋撻梻浣藉吹閸嬫稑螞鐎靛憡顫?
    const backgroundColor = await resolveInitialWindowBackgroundColor();
    
    // 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎯у閻滅粯淇婇妶鍌氫壕閻?
    createWindow(backgroundColor);

    // 闂備礁鎲＄敮妤冩崲閸岀儑缍栭柟鐗堟緲缁€宀勬煛瀹ュ骸浜為柣顓熷笧缁辨帡寮幋婵堜画濠电姭鍋撻柛銉墮缁€澶愭煃閽樺鍣界紒鈧崟顖涚厱闁挎柨鎼俊濂告煕閵娿儱鑸规い鏇熺懇閹煎綊宕烽鐐靛€為梻浣告啞閻熻京寰婃禒瀣畺婵°倕鍟伴崡姘舵倵閿濆簼绨荤紒渚囧櫍閺屾盯骞掗幘鍓佺暤濡炪値鍋呴崝娆忕暦閻樿鍐€闁汇垻鏁搁ˇ?
    if (mainWindow) {
      try {
        terminalService = new TerminalService(mainWindow);
        setTerminalService(terminalService);
        console.log('[Electron] Terminal service initialized.');
      } catch (error) {
        console.error('[Electron] 缂傚倸鍊风粈渚€鎮ц箛娑辨晜妞ゆ帒瀚€氬鈧箍鍎遍幊搴綖閵堝鐓曢柟鐑樻尵缁犳挻銇勯锝呭鐎规洜濞€瀵€燁槹濞存粌銈搁弻?', error);
      }
    }

    // 濠碘槅鍋撶徊楣冩偋濡ゅ拋鏁冨┑鍌滎焾缁€鍡樼節闂堟稒锛嶆繛鍏碱殜閺屾盯寮介妸褍鈪归梺鍛婂煀缁辨洜妲愰幒鏇犵杸闁规崘鍩栧▓顕€姊?IPC 婵犵數鍋涢ˇ顓㈠礉瀹€鍕埞濞寸姴顑呭浠嬫倶閻愭潙鍔ら柍閿嬬墵閹﹢鎮欑€涙顦ユ繝娈垮枤閸嬬偛顭囬鍫濇闁靛牆娲ㄩˇ顕€鏌℃径鍡樻珕闁荤啿鏅犲畷鎶芥倻閽樺鐓戝銈呯箰濞夋碍寰勯幇顒傤槯闂佸憡渚楅崹鍐茬暦閸洘鐓曟繛鍡樼懅閸掓壆绱掗幍浣规珚闁诡喕绮欓垾锕傚箳閹炬剚浼?    // 濠电偛鐡ㄧ划宀勫嫉椤掑嫷鏁冨┑鍌滎焾缁犮儳鎲搁幋锔衡偓?initializeExtensions 濠电偞娼欓崥瀣暆閹间礁闂柛娑橈工缁剁偟鈧箍鍎卞Λ娆撳汲閸儲鐓曢柟閭﹀墰閻掓悂鏌涙惔銏″唉闁?ipcMain.handle闂備焦瀵х粙鎴︽嚐椤栫儐鏁嬮梺顒€绉甸崵濠囨煛婢跺鐏╃痪鎯ь煼閺屾稑鈻庨幇顒備淮闂佽鍨伴柊锝呯暦濠靛惟闁靛鍎遍懓鍨攽椤旂晫绠戠紒槌栧櫍楠?    registerSettingsHandlers(settingsManager, workspaceManager, mainWindow);
    registerSettingsHandlers(settingsManager, workspaceManager, mainWindow);
    console.log('[Electron] Settings IPC handlers registered.');
    
    // 婵☆偓绲介崯顐ょ博?闂備礁婀遍。浠嬪磻閹剧粯鐓涢柛顐ｇ箥濡叉悂鏌涢妸銉т粵闁逛究鍔庨埀顒婄秵娴滄粓顢氳閹鎮烽悧鍫熸嫳闂佹悶鍔嶅畝鎼佸极瀹ュ懐鏆嗛柍褜鍓熼幃娲箣濠垫劕娈梺鍛婄⊕閻ｎ亪鍩€椤掆偓椤﹂潧螞閸愵喖顫呴柣妯烘▕濞奸亶鏌℃径灞戒哗婵☆偄瀚伴獮鍐ㄎ旈崨顔惧姷濠殿喗顭堟禍顒勫矗閳ь剙鈹戦悙瀛樺碍鐎殿喖鐖奸幃锛勨偓锝庡亝娴溿倖绻涢幋鐐茬劰闁?
    const sendReadyEvent = () => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('main-process:ready');
      }
    };
    
    // 濠电姷顣介埀顒€鍟块埀顒€缍婇幃妯诲緞鐎ｃ劋绨婚梺姹囧灩閹测€愁浖閵娧€鍋撻悷鐗堝暈鐟滄澘鍟幈銊╂倷鐎涙ê顫￠梺鑺ッˇ閬嶅汲濮樿埖鐓欓悗娑櫭慨褏绱掓潏銊х畼缂侇喒鏅濋埀顒婄秵娴滄粎绮婇鈧弻娑樷枎閹邦剛浼岄梺閫炲苯鍘哥紒韬插€楀Σ鎰版焼瀹ュ懓袝闂佹寧娲嶉崑鎾绘煕椤垵鐏ｇ紒顔肩仛瀵板嫭绻濋崟顓р偓鈧梻浣告啞濮婄粯鎱ㄩ幆顬″綊宕堕埞鎯т壕闁荤喓澧楀﹢浼存煕閵婏箑鍝虹€规洏鍎查幆鏃堝灳瀹曞洤鐭濋梻?
    if (mainWindow && mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', sendReadyEvent);
    } else {
      sendReadyEvent();
    }
  } catch (error) {
    console.error('[Electron]  闂備礁婀遍。浠嬪疾濞戙垺鍎撶€广儱娲ょ€垫煡鏌ゆ慨鎰偓妤呭春閻樼粯鐓曢柟鐑樻尵缁犳挻銇勯锝呭鐎规洜濞€瀵€燁槹濞存粌銈搁弻?', error);
    // 闂備礁鎲￠〃鍛村储閺嶃劎绠鹃柛銉ｅ妼缁剁偤寮堕崼顐函鐞氭繃绻涢幋鐐粹拻闁哥姴閰ｅ畷褰掑础閻戝棗娈橀梺鎯х箰濠€鍗炵暦閸洘鐓曟繛鍡樼懅缁夊墎绱掓潏銊ф噰闁哄苯妫濆畷褰掝敊閻撳氦绁撮梺鍦帶閻°劌顫忔繝姘瀬闁靛牆顦涵鈧梺鐐藉劥鐏忔瑧绮旈崼鏇熺叆婵炴垶锕╁褏绱掓潏銊х畺闁瑰嘲鎳樺畷鍗炩槈濡ゅ啰绀嗛梻浣侯焾缁绘劗绮旇ぐ鎺戦棷闁告稑锕ょ欢鐐碘偓骞垮劚閹冲酣鎮橀敓鐘崇叆?
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
 * 闂備礁婀遍。浠嬪磻閹剧粯鐓涢柛顐ｇ箥濡叉椽鏌ｅ☉鏍у姦鐎规洩缍侀弫鎰板川椤撶偟绋戦梻鍌氬€搁崑鍡涘储閽樺娓婚柛宀€鍋為悞濠氭煃瑜滈崜鐔风暦濞嗘挻鍋栭悗闈涙憸椤︼箮acOS 闂傚倸鍊哥€氥劑宕愰弴鈶哄洦绻濆顓熸?
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 闂佸湱鍘ч悺銊ヮ潖婵犳艾鏋侀柕鍫濐槹閻掑鏌嶈閸撶喎鐣峰▎鎾充紶闁告洦鍋掗弸鈧繝鐢靛仦閹告悂骞婇幇鏉跨畺?
 */
app.on('before-quit', () => {
  console.log('[Electron] 闂佸湱鍘ч悺銊ヮ潖婵犳艾鏋侀柕鍫濐槸绾偓闂佸憡鍔樼亸娆忊枔濞差亝鈷戞い鎰枎娴滈箖姊洪崨濠傜仼閻忓繈鍔庡Σ鎰攽閸℃劏鍋撻幒妤€宸濇い鏍ㄧ☉閳ь剛鍋ら幃纭咁槻閻庢凹鍘鹃懞?..');
});

ipcMain.handle('ai:fetch', async (event, url, options = {}) => {
  console.log('[IPC] AI Fetch 闂佽崵濮村ú顓㈠绩闁秵鍎?', url);
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      // 闂備礁鎲￠崹闈浳涘Δ鍚藉洭顢楅崒娑樼彴闂備礁鐏濋鍥э耿閹绢喗鈷戞い鎰╁焺濡偓闂?
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        // 缂傚倷绀侀崐鐑芥嚄閸洖鏋侀柕鍫濇处鐎氭艾霉閿濆懎妲诲┑顔界☉铻栭柣妯垮皺閻掔兘鏌ｉ敃鈧ˇ鐢稿极瀹ュ懐鏆嗛柛鏇ㄤ簽缁辨岸姊虹粙璺ㄧ缂佸鍏樺畷闈涱煥閸涱垶鈹忛梺璇″瀻閸曨偀鍋撻幎鑺ュ仯闁搞儻闄勯ˇ鐑芥煕閺冨倸鏋涙慨濠傤煼椤㈡岸鍩€椤掑嫨鈧?
        rejectUnauthorized: false
      };
      
      // 闂備礁鎲￠悷锕傚垂婵傜绠查柨婵嗘处鐎氭岸姊洪崹顕呭剳婵犫偓?
      const req = client.request(requestOptions, (res) => {
        let body = '';
        
        // 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冪懅绾句粙鏌″搴′簽闁?
        res.setEncoding('utf8');
        
        // 闂備浇銆€閸嬫捇鏌涢锝嗙闁艰尙濞€閺屾稑鈹戦崱娅恒垻绱掗妸锔惧弨鐎殿噮鍋婇幃褔宕煎┑鍫涘亰
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        // 闂備礁鎲＄换鍌滅矓鐎垫瓕濮抽柤纰卞墰绾惧ジ鏌熼幆褏鎽犻悘?
        res.on('end', () => {
          console.log('[IPC] AI Fetch 闂備礁鎲＄换鍌滅矓鐎垫瓕濮抽柡灞诲劜閸嬫劙鎮规担绛嬫綈閻?', res.statusCode);
          
          // 闂佽绻愮换鎰涘Δ鍛闂佸灝顑嗛崕鐔兼煛閸愩劍澶勭紒渚囧櫍閺岀喓鎷犻埄鍐獢闁荤姵鍔楅崰鏍х暦閿濆鏁嶆慨妯夸含椤ｆ煡姊洪崨濠傜瑲妞ゃ劌鎳愰埀顒€鐏氶悡锟犲箚閸愵喖绀嬫い鎺戝€搁ˉ鏇㈡⒑?
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: body
          });
        });
      });
      
      // 闂傚倷鐒︾€笛囨偡閵娾晩鏁嬮柕鍫濇缁剁偤鏌涢弴銊ュ箺闁?
      req.on('error', (error) => {
        console.error('[IPC] AI Fetch 闂傚倷鐒︾€笛囨偡閵娾晩鏁?', error);
        reject(error);
      });
      
      // 闂備礁鎲￠悷锕傚垂閸ф鐒垫い鎴炲缁佺増銇勯弴銊ュ閺佸牓鏌涚仦鍓ф噮缂佸銈搁弻銊モ槈濡厧顣哄銈傛暘閸パ冨殤濠电姴锕ょ€氼厾绮婚幒妤佺叆?
      if (options.body) {
        req.write(options.body);
      }
      
      // 缂傚倸鍊烽悞锕傚箰鐠囧樊鐒芥い鎰╁€栫€氭岸姊洪崹顕呭剳婵犫偓?
      req.end();
    } catch (error) {
      console.error('[IPC] AI Fetch 闁诲孩顔栭崰鏍磹閹间焦鍋?', error);
      reject(error);
    }
  });
});

ipcMain.handle('extension:send-message', async (event, extensionId, message) => {
  // 闂佸搫顦弲婊堟偡閳哄懎闂柣鎴ｅГ椤ュ棝鏌嶈閸撴盯骞夐悧鍫熷闁告縿鍎插鏍⒑缂佹鐭屽褎顨嗛弲鍓佹崉閵娿倖鍕冮梺鍝勬川閸犳挸鏆╅梻浣筋嚃閸欏酣宕归幏灞讳汗闁稿瞼鍋為悞璇层€掑锝呬壕闂侀€炲苯澧俊鍙夊笧濞?
  console.log('[IPC] 闂備礁鎲￠悷锕傚垂閸ф鐒垫い鎴ｆ硶閸斿秶绱掓径灞藉幋妤犵偘绶氶、娑橆潩椤掑倸甯撻梻浣告贡椤ｄ粙寮插☉銏″創?', extensionId, message);
  return { success: true };
});

/**
 * 闂備礁鎼崐绋棵洪敐鍛瀻闁靛繈鍊曠粻鑲┾偓骞垮劚鐎氼喚绮?IPC 濠电姰鍨煎▔娑氣偓姘煎櫍楠?
 */

// 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱濡﹢鏌涢妷顖炴妞ゆ劒绮欓幃妤呮偨濞堟寧鏁梺浼欑細缁瑩寮?
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
      
      // 濠德板€楁慨鎾儗娓氣偓閹焦寰勯幇顒侇棟闂佹悶鍎婚梽鍕敃閻ｅ瞼纾兼い鎰╁労閸ゆ瑩鏌?
      if (!workspaceManager.isSupportedFileType(filePath)) {
        return {
          success: false,
          error: 'Unsupported file type. Only .md, .markdown, .json, .txt are allowed.'
        };
      }
      
      const content = await fsPromises.readFile(filePath, 'utf-8');
      const language = workspaceManager.getFileLanguage(filePath);
      
      // 婵犵數鍎戠紞鈧い鏇嗗嫭鍙忛柣鎰惈缁€鍡涙煟濡も偓閻楀﹥绂掑鈧鍫曞煛閸屾氨浠搁梺鍝勵儏閸燁垳绮嬮幒鏃€宕夐柛婵嗗娴犳岸姊?
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
    console.error('[IPC] 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀箚閹殿喚缈遍柣?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟瀵稿У閸犲棝鏌涢埄鍐х繁闁哄棎鍎甸弻锟犲磼濮橆厾鐓戝┑鐐叉閸ㄥ鍩€椤掑倹鏆╂い銏狅躬閹焦绂掔€ｎ偅娅?
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
    console.error('[IPC] 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟瀵稿У閸犲棝鏌涢埄鍐х繁闁哄棎鍎甸弻锟犲磼濮橆厾鐓戝┑鐐叉閸ㄥ搫顕ラ崟顒佺秶妞ゆ劑鍎?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佽崵濮村ú鈺咁敋瑜戦妵鎰板炊椤掆偓缁犱即鏌涢妷鎴濇噺濮ｅ酣鏌ｉ悩杈劅闁搞劍澹嗗▎銏ゆ倷閻戞ê鍓梺鍛婃处閸撴岸鎮楅娴庡綊鎮╂笟顖氭櫍缂備浇椴搁悷鈺呭箖娴犲惟闁靛牆娲╂竟姗€姊洪崫鍕偓绋棵洪敐鍛瀻闁靛繈鍊曢崘鈧梺鐟扮摠缁诲倿鎷戦悢鍏肩厱闁瑰濮风敮娑橆熆瑜濈粻鎴︻敋閿濆鐒垫い鎺戝閺?
ipcMain.handle('file:read', async (event, filePath) => {
  try {
    // 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑闂佸搫顑呴崯顖滅矉閹烘鍤嬮柛顭戝€ｉ敃鍌涚厱婵ê澧介悾閬嶆煟鎺抽崝鎴﹀极?
    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: 'Path exists but is not a file.'
      };
    }
    
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const language = workspaceManager.getFileLanguage(filePath);
    
    // 婵犵數鍎戠紞鈧い鏇嗗嫭鍙忛柣鎰惈缁€鍡涙煟濡も偓閻楀﹥绂掑鈧鍫曞煛閸屾氨浠搁梺鍝勵儏閸燁垳绮嬮幒鏃€宕夐柛婵嗗娴犳岸姊?
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
    console.error('[IPC] 闂佽崵濮村ú鈺咁敋瑜戦妵鎰板炊椤掆偓濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀箚閹殿喚缈遍柣?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱閻愬﹪鏌涢幘妤€鍠氶弳顒勬⒑閸濆嫬鈧煤閿濆應鏋庨柕蹇婃噰閸嬫捇鎮藉▓鎸庢暞闂佷紮缂氱划娆撳极?
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
    console.error('[IPC] 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱閻愬﹪鏌涢幘妤€鍠氶弳顒佺節閵忊€冲姸缂侇喖澧介幉?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟瀵稿仜缁剁偞鎱ㄥ鍡楀箺闁诲寒鍠栭湁闁绘灏欓崺锝夋煃瑜滈崜娆撍囬幍顔瑰亾濮樸儱濡块柍褜鍓涢弫鎼併€佹繝鍥ㄥ剨闁芥ê顦藉ù鏍煕閳藉棗骞樼紒鈧崟顖涚厽妞ゎ偒鍓欐俊铏圭磼椤垵澧撮柟顖氱焸婵＄兘濡歌椤岸鏌熼悡搴ｆ憼闁瑰憡鎮傞、姘舵焼瀹ュ懐顦ч梺闈涱樈閸ㄥ磭绮?
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
      // 闂佸搫顦弲娑樏洪敃鍌氱闁靛牆顦Λ姗€鏌涢妷顖炴妞ゆ劗鏅槐鎺楊敃閵夘喖娈梺璇叉捣閸忔﹢寮鍥︽勃闁芥ê顦伴柨顓㈡煛婢跺棙娅嗛柡灞诲妼鐓ら柡宥庡幖缂佲晜銇勯弽銊р槈闁伙富鍣ｉ弻锝夊Ω閵夈儺浠鹃梺鍝勵儏閸熸挳寮?
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
    console.error('[IPC] 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟瀵稿仜缁剁偞鎱ㄥ鍡楀箺闁诲寒鍠栭湁闁绘鍎ょ涵鐐亜閺囥劌鏋ら柟椋庡Т閳规垿宕堕懜鍨殸濠电姰鍨洪崕鑲╁垝閸撗勫枂?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈屽銈嗘处閸犳岸骞忛悩娴嬫斀闁搞儴鍩栭弫閬嶆⒑閹稿海鈽夐柣妤€绻樺顐﹀Χ閸℃瑯娲搁柟鑲╄ˉ閳ь剝灏欓惌妤佺箾鏉堝墽绋荤紒顔肩灱娴滄悂顢涢悙瀛樻珫闁诲繒鍋犻崑鎰玻濡ゅ懏鍋ｅù锝囶焾閳锋棃鏌ｉ妶鍛棞妞ゆ柨绻樻俊鐑藉Χ閸モ斁鏋欓梻浣告啞閻楃偛鈻嶉敐鍚ゆ椽骞忕仦璁虫睏闂佸搫娴傛禍鐐电矆?
ipcMain.handle('folder:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      
      // 濠电儑绲藉ú锔炬崲閸岀偞鍋ら柕濞垮労閸熷懘鏌曟径鍫濃偓妤冪矙婵犲洦鐓曢柡宥庡幘缁变即鏌ｉ銏㈢暫闁?
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
    console.error('[IPC] 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺闈涙处閸ㄥ潡寮?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈屽銈嗘处閸犳岸骞忛悩娴嬫斀闁搞儴鍩栭弫閬嶆⒑閹稿海鈽夐柣妤€绻樺顐﹀Χ閸℃瑯娲搁柟鑹版彧缁插潡宕ｉ埀顒勬煟閻樺弶鎼愭俊顐ｎ殘閼鸿鲸娼忛埞鎯т壕闁汇垽娼х敮鍫曟煕濞嗗繑顥㈤柡浣哥Ф娴狅箓鎳栭埡鍐╁枓闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冾殢閸熷懘鏌曟径鍫濃偓妤冪矙婵犲洦鐓曢柡宥庡墯椤忕姵绻涢崣澶婎€滈柕鍥ㄥ姍瀵挳顢旈崱娆樻Т
ipcMain.handle('knowledge-base:open-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      
      // 闂備焦妞块崢褰掑磿閹绢喗鍎婇柟瀵稿仦閸庣喖鏌熼悙顒€澧柛銈冨€濋弻娑滅疀鐎ｎ亜濮曢梺鍝勵儏閸燁垳绮嬮幒鏃€宕夐柟顓熷笂缁瓨绻涢幋鐐村碍缂佸鍏橀、娆撳即閻樼數锛炲銈嗘濡法妲愰敐鍚ゅ綊鏁愰崱娆戠厐闁诲繐娴氶崹鍫曞箚閸曨垼鏁婇柤娴嬫櫇鍗忛梻浣瑰缁嬫垶绺介弮鍌涘仏闂侇剙绉甸崵鈧梺鍛婁緱閸橀箖寮冲鑸电厱闊洤顑呮俊鍧楁倵濮樼厧寮柡?
      
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
    console.error('[IPC] 闂備胶鎳撻悘姘跺箰閸濄儲顫曢柟杈剧畱濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺闈涙处閸ㄥ潡寮?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備浇顫夐鏍磻閸涱収鍤曢柛褎顨呭Λ姗€鏌涢妷顖炴妞ゆ劘妫勯…鍧楀醇閺囨浜炬繛鎴炵矊楠炩偓闂備焦鐪归崝宀€鈧凹鍙冨顐︻敋閳ь剟鐛幇顓熷閻熸瑥瀚埀顒夊枛闇夐柣妯硅閸熷洨绱掓潏銊ф噰闁诡喕绮欐俊鎼佸Χ閸ヮ亜顥濋梻浣规た閸樺綊宕曢幘顔藉剨闁瑰鍋為崕鐔兼煙閻愵剙澧柛銈冨€濋弻娑滅疀鐎ｎ亜濮风紓?
ipcMain.handle('folder:scanFiles', async (event, folderPath) => {
  try {
    const supportedExtensions = ['md', 'markdown', 'json', 'txt'];
    const filePaths = [];

    // 闂傚倷绶￠崑鍛暜閹烘梻绀婂┑鐘叉搐缁犮儲銇勯幇鍓佸埌濞寸厧閰ｉ弻锟犲磼濮橆厾鐓戝┑鐐叉閸ㄤ粙寮?
    const scanDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 闂傚倷绶￠崑鍛暜閹烘梻绀婂┑鐘叉搐缁犮儲銇勯幇鍓佸埌濞寸厧閰ｉ幃妤€鈽夊▎蹇擃潔闂佸搫顑呴崯顖滅矉閹烘梹宕夐柟顓熷笂缁?
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          // 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑闂佸搫顑呴崯顖滅矉閹烘鍤嬮梻鍫熺▓閹稿懘鏌ｈ箛鏇炰沪婵炲弶鐗犻獮?
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
    console.error('[IPC] 闂備浇顫夐鏍磻閸涱収鍤曢柛褎顨呭Λ姗€鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺闈涙处閸ㄥ潡寮?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佽崵濮村ú鈺咁敋瑜戦妵鎰板炊椤掆偓濡﹢鏌涢妷顖炴妞ゆ劘妫勯…璺ㄦ崉閻戞纭€濠电偛寮舵刊浠嬪Φ閹版澘鍗抽柣妯虹仛鐏忔繈姊?
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
          
          // 闂備礁鎼粔鐑斤綖婢跺﹦鏆ゅ〒姘ｅ亾妤犵偛绉归崺鈩冩媴閻戞绉鹃梻浣告啞閼瑰墽绮旈崼鏇炵伋婵☆垰鐨烽崑鎾舵喆閸曨亙瀛╁銈嗘磸閸ㄥ骞婂☉銏犵劦?
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
      
      // 闂備礁婀遍崕銈囨暜閹烘棁濮虫い鎾卞灪閺咁剚鎱ㄥΟ鍧楀摵缂佹劖顨堥幉鎼佹偋閸喓顦ュ┑鐘亾妞ゅ繐鐗嗙粈鍫⑩偓骞垮劚缁绘帞绮堟径鎰厸闁稿本纰嶉惌妤佺箾閸℃劕鐏茬€规洜鍏樻俊鎼佸Ψ閿曗偓閳ь剛鏁婚弻銊モ槈濡灝顏梺璇″枛濞差參骞婂☉銏╂晜闁告侗鍘惧Ο鍡涙煟鎼淬垻鈯曟い銊ユ閹礁鈹戠€ｎ亞顔婇梺鍦劋閸ㄥ湱鍠?
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
    console.error('[IPC] 闂佽崵濮村ú鈺咁敋瑜戦妵鎰板炊椤掆偓濡﹢鏌涢妷顖炴妞ゆ劘妫勯…璺ㄦ崉閻戞纭€缂備緡鍠撻崝鎴濐嚕閹间礁绀嬫い鎰С閺夘參姊?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂傚倷绶￠崑鍛暜閹烘梻绀婂┑鐘叉处閸ゆ梻鈧懓瀚妯煎緤閸ф鐓欑痪鐗埫禍楣冩⒑閸濆嫮澧曟い锕備憾閹兘顢旈崱妯侯€涢梺缁橆殔閻楀﹪鎮楅娴庡綊鎮╂笟顖氭櫍缂備浇椴搁悷锕€顭囨繝姘倞闁靛绠戣闂備胶鎳撻幖顐λ囨导鏉戝嚑闁告劏鏅濋々鐑芥偣閻戞ü鑸ù鐘冲哺閺?
ipcMain.handle('folder:get-all-notes', async (event, folderPath) => {
  try {
    const allFiles = [];
    
    // 闂傚倷绶￠崑鍛暜閹烘梻绀婂┑鐘插鐎氭岸鎮归崶銊ョ祷缂佹彃娼￠弻鐔哄枈濡桨澹曢梻浣告惈閻楀棝藝娴兼潙鍑犻柛鎰靛枟閺?
    const readFilesRecursively = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Ignore hidden entries when collecting note files.
        if ((entry.name.startsWith('.') && entry.name !== '.wstudio') || entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 闂傚倷绶￠崑鍛暜閹烘梻绀婂┑鐘插暙缁剁偤鏌涢弴銊ュ箺闁稿﹦鍋ら幃妤€鈽夊▎蹇擃潕濠电偠寮撻崡鎶藉极?
          await readFilesRecursively(fullPath);
        } else {
          // 闂備礁鎲￠悷顖涚濠靛閿ゅ┑鐘叉搐缁€澶愭煟濡寧鐝柣搴枛闇夐柣妯硅閸熷洨绱掓潏銊ф噰鐎殿喓鍔戦、娑樷槈濡吋啸闂備焦鐪归崝宀€鈧凹鍣ｉ幃鐑筋敂閸℃ê顎涢梺缁橆殔閻楀繑绔熼幇顔瑰亾濞堝灝鏋涘Δ鐘茬箳濡?
          const ext = path.extname(entry.name).toLowerCase();
          const supportedExtensions = ['.md', '.markdown', '.txt', '.json'];
          
          if (supportedExtensions.includes(ext)) {
            const relativePath = path.relative(folderPath, fullPath);
            const stats = await fsPromises.stat(fullPath);
            
            // 闂佽崵濮村ú鈺咁敋瑜戦妵鎰板炊椤掆偓濡﹢鏌涢妷顖炴妞ゆ劗鏅槐鎺懳旀繝鍌氬箰缂備焦姊归幐鎶藉极?
            let firstLine = '';
            try {
              const content = await fsPromises.readFile(fullPath, 'utf-8');
              // 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉㈡櫇缁犳梹銇勯幋锝嗙《妞ゅ繘浜堕幃璺衡槈濡偐鍔┑鐐碘拡娴滅偟鍒掑璺轰紶闁告洦鍋呴弳銉╂⒑?
              const lines = content.split('\n');
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                  firstLine = trimmedLine;
                  break;
                }
              }
            } catch (error) {
              console.warn(`[IPC] 闂佽崵濮村ú鈺咁敋瑜戦妵鎰板炊椤掆偓濡﹢鏌涢妷顖炴妞ゆ劗鏅槐鎺懳旀繝鍌氬箰缂備焦鏌ㄩ顓㈠箖閹殿喕娌┑顔藉姃閺夘參姊? ${fullPath}`, error);
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
    
    // 闂備礁婀遍…鍫ニ囬鐐茬畺闁哄洨濮烽惌鎾绘煟濡も偓閻楀棛绮幘缁樼叆?
    allFiles.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      success: true,
      data: allFiles
    };
  } catch (error) {
    console.error('[IPC] 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉墮缁犮儵鏌嶈閸撶喎顕ｉ崹顐㈢窞鐎光偓閳ь剟骞婃径鎰仯濞达絽鎼。濂告煛鐎ｎ亜鏆炵紒鍌涘笧閹瑰嫰骞侀幒宥嗘線闂?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎹愵嚙濡﹢鏌ｅΔ鈧悧濠囨倵椤曗偓閺?
ipcMain.handle('folder:create-file', async (event, parentPath, fileName) => {
  try {
    const filePath = path.join(parentPath, fileName);
    
    // 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑闂佸搫顑呴崯顖滅矉閹烘鍤嬮柛顭戝€ｉ敃鍌涚厱婵ê澧介悾閬嶆煕閹搭垳纾块柍褜鍓氱粙鎺楁晪濠电姭鍋?
    try {
      await fsPromises.access(filePath);
      return {
        success: false,
        error: 'File already exists.'
      };
    } catch {
      // 闂備礁鎼崐绋棵洪敐鍛瀻闁靛骏绱曢埢鏃傗偓骞垮劚閹虫劙骞楅悩缁樼厱闁挎棁宕甸崢婊呯磼鏉堛劎绠樼紒杈ㄥ笩椤︽挳鏌ｉ姀鐙€鐓肩€规洘鑹鹃埥澶娢熼懖鈺侇槱
    }
    
    // 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎯у閻岸鏌ｉ幋鐐嗘垿鎮楅鈧弻?
    await fsPromises.writeFile(filePath, '', 'utf-8');
    
    return {
      success: true,
      data: {
        path: filePath,
        name: fileName
      }
    };
  } catch (error) {
    console.error('[IPC] 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎹愵嚙濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀箚閹殿喚缈遍柣?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 濠电姰鍨煎▔娑氱矓閹绢喖鏄ユ俊銈呮噹濡﹢鏌涢妷顖炴妞ゆ劒绮欓弻娑㈠箳閹炬剚妫嗗┑鐐跺紦閸楀啿顕ｆ禒瀣倞闁靛濡囬埀顒夊枛闇夐柣妯煎劋绾箖鏌?
ipcMain.handle('file:copy-to-folder', async (event, sourcePath, targetFolderPath) => {
  try {
    // 缂備胶铏庨崣搴ㄥ窗閺囩姵宕叉慨妯垮煐閸庡孩銇勯弮鍌涙珪闁搞劌銈搁弻锟犲磼濮橆厾鐓戝┑鐐叉閸ㄥ搫顕ラ崟顖涘仭闁规鍠楅幉濂告⒑?
    await fsPromises.mkdir(targetFolderPath, { recursive: true });
    
    // 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉戔偓閺€锕傛煙闁箑骞楅柣搴枛闇夐柣妯煎劋绾箖鏌?
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetFolderPath, fileName);
    
    // 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑Б濠电偠寮撻崡鍐差嚕娴犲鐐婇柕濠忓閳ь剦鍠栭湁闁绘ê鎼悡鎰繆閸欏鍊愮€规洏鍎甸弫鍐焵椤掑嫬绀勯柨娑樺閸嬫挸鈽夊▍顓т簻閿?
    try {
      await fsPromises.access(targetPath);
      // 闂備礁鎼崐绋棵洪敐鍛瀻闁靛繒濯崯鍛存煙缂佹ê绗ч柟鐣屽█閺屾盯鏁傞懡銈呭辅缂備浇椴哥换鍫ュ箖娴犲鍋勭紒瀣硶娴滐綁姊洪崫鍕偓缁樻櫠濡ゅ懎鍑犻柛鎰ㄦ櫇椤╃兘鎮归搹鐟板妺闁?
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      const timestamp = Date.now();
      const newFileName = `${nameWithoutExt}_${timestamp}${ext}`;
      const newTargetPath = path.join(targetFolderPath, newFileName);
      
      // 濠电姰鍨煎▔娑氱矓閹绢喖鏄ユ俊銈呮噹濡﹢鏌涢妷顖炴妞?
      await fsPromises.copyFile(sourcePath, newTargetPath);
      
      return {
        success: true,
        data: {
          path: newTargetPath,
          name: newFileName
        }
      };
    } catch {
      // 闂備礁鎼崐绋棵洪敐鍛瀻闁靛骏绱曢埢鏃傗偓骞垮劚閹虫劙骞楅悩缁樼厱闁挎棁宕甸崢婊呯磼鏉堛劎绠為柟顖氬閳ь剚绋掗敋濠㈣泛绉撮…璺ㄦ崉閾忓墣銏ゆ煕?
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
    console.error('[IPC] 濠电姰鍨煎▔娑氱矓閹绢喖鏄ユ俊銈呮噹濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀箚閹殿喚缈遍柣?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎹愵嚙濡﹢鏌ｅΔ鈧悧濠囨倵椤旀祹褰掓偐閻戞銆愰梺?
ipcMain.handle('folder:create-folder', async (event, parentPath, folderName) => {
  try {
    const folderPath = path.join(parentPath, folderName);
    
    // 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑闂佸搫顑呴崯顖滅矉閹烘梹宕夐柟顓熷笂缁挳姊洪崫鍕伌闁搞劋鍗抽獮鍡樻媴閸撴彃鏅犻梺鍦帛鐢偤骞楅悩缁樼叆?
    try {
      await fsPromises.access(folderPath);
      return {
        success: false,
        error: 'Folder already exists.'
      };
    } catch {
      // 闂備礁鎼崐绋棵洪敐鍛瀻闁靛繆鈧磭绐為梻渚囧亝缁嬫捇鎮峰┑瀣€垫繛鎴烆仾椤忓嫸鑰挎い蹇撶墛閺咁剛鈧厜鍋撻柍褜鍓熼獮瀣槹鎼达絿锛滃銈嗘尵閸嬫盯鎮橀敓鐘崇叆?
    }
    
    // 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎹愵嚙濡﹢鏌涢妷顖炴妞ゆ劒绮欓弻?
    await fsPromises.mkdir(folderPath, { recursive: false });
    
    return {
      success: true,
      data: {
        path: folderPath,
        name: folderName
      }
    };
  } catch (error) {
    console.error('[IPC] 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎹愵嚙濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺闈涙处閸ㄥ潡寮?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 缂備胶铏庨崣搴ㄥ窗閺囩姵宕叉慨妯挎硾濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺瀹︽澘濮傜€规洜鍏橀垾锕傚箳閺冨偆妲遍梻鍌欑贰閸嬪懐鏁幒鏃傜濠电姴娲ょ粈鍡樼箾閹寸儐鐒界紒鎲嬬畵閺?
ipcMain.handle('folder:ensure-dir', async (event, dirPath) => {
  try {
    // 濠电偠鎻紞鈧繛澶嬫礋瀵?recursive: true 缂備胶铏庨崣搴ㄥ窗閺囩姵宕叉慨妯挎硾缁犮儵鏌嶈閸撶喎顕ｉ崹顐㈢窞閻忕偟鏅崢顒勬⒑閸濆嫬鈧煤閿濆應鏋庨柕蹇娾偓宕囩獮閻熸粎澧楃敮鎺楀储閹绢喗鍋犳慨妯煎帶娴滄粓鏌涢妸鈺€鎲鹃柡?
    await fsPromises.mkdir(dirPath, { recursive: true });
    
    return {
      success: true,
      data: {
        path: dirPath
      }
    };
  } catch (error) {
    console.error('[IPC] 缂備胶铏庨崣搴ㄥ窗閺囩姵宕叉慨妯挎硾濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺瀹︽澘濮傜€规洜鍏樻俊鎼佸Ψ閿濆嫭婢€闂?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂佽绻掗崑鐐裁洪弽顐ｎ潟闁硅揪绠戝Λ姗€鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｈ浠х紓浣介哺閻熲晠鐛繝鍥х闁瑰瓨绻嶅閬嶆煛婢跺苯浠╂俊顐㈠閹搫鈻庨幘鏉戝壆濡炪倖妫侀崑鎰矓閸ф鐓?
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
          
          // 闂備礁鎼粔鐑斤綖婢跺﹦鏆ゅ〒姘ｅ亾妤犵偛绉归崺鈩冩媴閻戞绉鹃梻浣告啞閼瑰墽绮旈崼鏇炵伋婵☆垰鐨烽崑鎾舵喆閸曨亙瀛╁銈嗘磸閸ㄥ骞婂☉銏犵劦?
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
      
      // 闂備礁婀遍崕銈囨暜閹烘棁濮虫い鎾卞灪閺咁剚鎱ㄥΟ鍧楀摵缂佹劖顨堥幉鎼佹偋閸喓顦ュ┑鐘亾妞ゅ繐鐗嗙粈鍫⑩偓骞垮劚缁绘帞绮堟径鎰厸闁稿本纰嶉惌妤佺箾閸℃劕鐏茬€规洜鍏樻俊鎼佸Ψ閿曗偓閳ь剛鏁婚弻銊モ槈濡灝顏梺璇″枛濞差參骞婂☉銏╂晜闁告侗鍘惧Ο鍡涙煟鎼淬垻鈯曟い銊ユ閹礁鈹戠€ｎ亞顔婇梺鍦劋閸ㄥ湱鍠?
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
    console.error('[IPC] 闂佽绻掗崑鐐裁洪弽顐ｎ潟闁硅揪绠戝Λ姗€鏌涢妷顖炴妞ゆ劘妫勯…鍧楀礈娴ｇ懓娈岄梺闈涙处閸ㄥ潡寮?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 闂備礁鎲￠悷杈╃不閹达附鍋ら柕濠忓閳绘棃鏌涘┑鍡楊伌闁搞倗濞€閹綊宕堕妸褏鐣哄?
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
      
      // 婵犵數鍎戠紞鈧い鏇嗗嫭鍙忛柣鎰惈缁€鍡涙煟濡も偓閻楀﹥绂掑鈧鍫曞煛閸屾氨浠搁梺鍝勵儏閸燁垳绮嬮幒鏃€宕夐柛婵嗗娴犳岸姊?
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
    console.error('[IPC] 闂備礁鎲￠悷杈╃不閹达附鍋ら柕濠忓閳绘棃鏌涘┑鍡楊仴濞存粌銈搁弻?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 濠电儑绲藉ú锔炬崲閸岀偞鍋ら柕濞炬櫅濡﹢鏌涢妷顖炴妞?
ipcMain.handle('file:save', async (event, filePath, content) => {
  try {
    await fsPromises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('[IPC] 濠电儑绲藉ú锔炬崲閸岀偞鍋ら柕濞炬櫅濡﹢鏌涢妷顖炴妞ゆ劘妫勯…鍧楀箚閹殿喚缈遍柣?', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * 缂傚倷鐒﹂崝鏍€冮崨鑸汗婵炴垯鍨圭粻宕囨喐瀹ュ鏄?IPC 濠电姰鍨煎▔娑氣偓姘煎櫍楠?
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

ipcMain.handle('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return false;
  }

  const nextIsMaximized = !win.isMaximized();
  if (nextIsMaximized) {
    win.maximize();
  } else {
    win.unmaximize();
  }

  return nextIsMaximized;
});

ipcMain.on('close-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

ipcMain.handle('window:is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
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

ipcMain.handle('window:open-note-in-new-window', async (_event, payload) => {
  const normalizedPayload = normalizeOpenNoteInNewWindowPayload(payload);
  if (!normalizedPayload) {
    return {
      success: false,
      error: 'Invalid note payload.'
    };
  }

  try {
    const backgroundColor = await resolveInitialWindowBackgroundColor();
    const createdWindow = createWindow(backgroundColor, {
      query: {
        startupMode: 'open-note-window',
        windowMode: 'editor-only'
      }
    });
    pendingOpenNoteWindowPayloads.set(createdWindow.id, normalizedPayload);
    return { success: true, windowId: createdWindow.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.on('window:editor-ready', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  const pendingPayload = pendingOpenNoteWindowPayloads.get(targetWindow.id);
  if (!pendingPayload) {
    return;
  }

  pendingOpenNoteWindowPayloads.delete(targetWindow.id);
  targetWindow.webContents.send('window:open-note-in-new-window', pendingPayload);
});

ipcMain.handle('bookmark-group-picker:prepare', (event) => {
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (!sourceWindow || sourceWindow.isDestroyed()) {
    return { success: false };
  }

  ensureBookmarkGroupPickerSession(sourceWindow);
  return { success: true };
});

ipcMain.handle('bookmark-group-picker:open', async (event, request) => {
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (!sourceWindow || sourceWindow.isDestroyed()) {
    return { status: 'cancelled', groupId: null };
  }

  const sessionRecord = ensureBookmarkGroupPickerSession(sourceWindow);
  resolveBookmarkGroupPickerSession(sessionRecord.popupWindow.id);

  return await new Promise((resolve) => {
    sessionRecord.resolve = resolve;
    sessionRecord.resolved = false;
    syncBookmarkGroupPickerWindow(sessionRecord, sourceWindow, request);
    showBookmarkGroupPickerWindow(sessionRecord);
  });
});

ipcMain.handle('bookmark-group-picker:get-state', (event) => {
  const popupWindow = BrowserWindow.fromWebContents(event.sender);
  if (!popupWindow || popupWindow.isDestroyed()) {
    return null;
  }

  const sessionRecord = bookmarkGroupPickerSessions.get(popupWindow.id);
  return sessionRecord?.request ?? null;
});

ipcMain.handle('bookmark-group-picker:select', (event, groupId) => {
  const popupWindow = BrowserWindow.fromWebContents(event.sender);
  if (!popupWindow || popupWindow.isDestroyed()) {
    return { success: false };
  }

  const normalizedGroupId = typeof groupId === 'string' && groupId.trim()
    ? groupId
    : null;
  hideBookmarkGroupPickerWindow(popupWindow.id, {
    status: 'selected',
    groupId: normalizedGroupId
  });

  return { success: true };
});

ipcMain.handle('bookmark-group-picker:cancel', (event) => {
  const popupWindow = BrowserWindow.fromWebContents(event.sender);
  if (!popupWindow || popupWindow.isDestroyed()) {
    return { success: false };
  }

  hideBookmarkGroupPickerWindow(popupWindow.id);

  return { success: true };
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
