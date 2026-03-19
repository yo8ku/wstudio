/**
 * Starter panel client script for the WStudio plugin scaffold.
 */

const logElement = document.getElementById('starter-log');
let pingCount = 0;

function appendLog(label, payload) {
  if (!logElement) {
    return;
  }

  const current = logElement.textContent || '';
  const nextLine = `${label}: ${JSON.stringify(payload, null, 2)}`;
  logElement.textContent = current === 'Waiting for plugin messages...'
    ? nextLine
    : `${current}\n\n${nextLine}`;
}

function emit(message) {
  window.parent.postMessage(message, '*');
  appendLog('iframe -> host', message);
}

function bindAction(elementId, getMessage) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const trigger = () => {
    emit(getMessage());
  };

  element.addEventListener('click', trigger);
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      trigger();
    }
  });
}

bindAction('request-state', () => ({
  action: 'request-starter-state',
}));

bindAction('send-ping', () => {
  pingCount += 1;
  return {
    action: 'ping',
    count: pingCount,
    sentAt: new Date().toISOString(),
  };
});

window.addEventListener('message', (event) => {
  appendLog('host -> iframe', event.data);
});
