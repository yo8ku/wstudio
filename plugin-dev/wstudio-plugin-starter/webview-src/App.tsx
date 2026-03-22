/**
 * React panel application for the starter plugin scaffold.
 * Demonstrates host messaging, state requests, and a styled plugin dashboard.
 */

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

type StarterRequestMessage = {
  action: 'request-starter-state';
};

type StarterPingMessage = {
  action: 'ping';
  count: number;
  sentAt: string;
};

type StarterOutboundMessage = StarterRequestMessage | StarterPingMessage;

type StarterReadyMessage = {
  type: 'plugin-ready';
  title: string;
  message: string;
  sentAt: string;
};

type StarterStateMessage = {
  type: 'starter-state';
  title: string;
  assetPath: string;
  sentAt: string;
};

type StarterResponseMessage = {
  type: 'plugin-response';
  action: string;
  receivedAt: string;
  originalMessage: StarterOutboundMessage;
};

type StarterInboundMessage = StarterReadyMessage | StarterStateMessage | StarterResponseMessage;

type StarterLogEntry = {
  id: string;
  direction: 'webview -> host' | 'host -> webview';
  payload: string;
};

const DEFAULT_TITLE = 'WStudio Plugin Starter Panel';
const DEFAULT_ASSET_PATH = '../assets/plugin-icon.svg';

function formatMessagePayload(message: StarterInboundMessage | StarterOutboundMessage): string {
  return JSON.stringify(message, null, 2);
}

function createLogEntry(
  direction: StarterLogEntry['direction'],
  payload: string,
): StarterLogEntry {
  return {
    id: `${direction}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction,
    payload,
  };
}

function appendLogEntry(
  setLogEntries: Dispatch<SetStateAction<StarterLogEntry[]>>,
  entry: StarterLogEntry,
): void {
  setLogEntries((currentEntries) => [...currentEntries, entry]);
}

function postMessageToHost(
  message: StarterOutboundMessage,
  setLogEntries: Dispatch<SetStateAction<StarterLogEntry[]>>,
): void {
  window.parent.postMessage(message, '*');
  appendLogEntry(setLogEntries, createLogEntry('webview -> host', formatMessagePayload(message)));
}

export function App(): JSX.Element {
  const [panelTitle, setPanelTitle] = useState<string>(DEFAULT_TITLE);
  const [assetPath, setAssetPath] = useState<string>(DEFAULT_ASSET_PATH);
  const [pingCount, setPingCount] = useState<number>(0);
  const [logEntries, setLogEntries] = useState<StarterLogEntry[]>([
    createLogEntry('host -> webview', 'Waiting for plugin messages...'),
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<StarterInboundMessage>): void => {
      const message = event.data;

      if (!message) {
        return;
      }

      if (message.type === 'starter-state') {
        setPanelTitle(message.title);
        setAssetPath(message.assetPath);
      }

      if (message.type === 'plugin-ready') {
        setPanelTitle(message.title);
      }

      appendLogEntry(setLogEntries, createLogEntry('host -> webview', formatMessagePayload(message)));
    };

    window.addEventListener('message', handleMessage);
    postMessageToHost({ action: 'request-starter-state' }, setLogEntries);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRequestState = (): void => {
    postMessageToHost({ action: 'request-starter-state' }, setLogEntries);
  };

  const handlePing = (): void => {
    const nextPingCount = pingCount + 1;
    setPingCount(nextPingCount);
    postMessageToHost(
      {
        action: 'ping',
        count: nextPingCount,
        sentAt: new Date().toISOString(),
      },
      setLogEntries,
    );
  };

  return (
    <main className="starter-app">
      <section className="starter-hero starter-card">
        <img className="starter-hero__badge" src={assetPath} alt="Plugin icon" />
        <div className="starter-hero__content">
          <p className="starter-kicker">WStudio React Plugin</p>
          <h1 className="starter-title">{panelTitle}</h1>
          <p className="starter-description">
            This starter demonstrates how to author the plugin host in
            <code> host-src/main.ts </code>
            with the official
            <code> @note-studio/extension-api </code>
            SDK
            and still ship the runtime entry as
            <code> scripts/main.cjs </code>
            while building the plugin UI with React, Vite, and Tailwind CSS.
          </p>
        </div>
      </section>

      <section className="starter-card starter-grid">
        <article className="starter-section">
          <h2 className="starter-section__title">Webview Workflow</h2>
          <p className="starter-section__body">
            Edit files in
            <code> webview-src/ </code>
            and rebuild them into
            <code> webviews/ </code>
            with
            <code> pnpm webview:build </code>
            or
            <code> pnpm webview:watch </code>
            .
          </p>
        </article>

        <article className="starter-section">
          <h2 className="starter-section__title">Tailwind Ready</h2>
          <p className="starter-section__body">
            Tailwind is already wired through `postcss.config.cjs` and
            `tailwind.config.cjs`, so you can use utilities or `@apply` directly in
            `webview-src/panel.scss`.
          </p>
        </article>
      </section>

      <section className="starter-card starter-grid">
        <article className="starter-section">
          <h2 className="starter-section__title">Host Bridge</h2>
          <p className="starter-section__body">
            The panel requests starter state from the host and echoes ping messages
            through the existing plugin message bridge.
          </p>
        </article>

        <article className="starter-section">
          <h2 className="starter-section__title">Utility Styling</h2>
          <div className="starter-pill-row">
            <span className="starter-pill">Tailwind Base</span>
            <span className="starter-pill">Tailwind Components</span>
            <span className="starter-pill">Tailwind Utilities</span>
          </div>
        </article>
      </section>

      <section className="starter-card">
        <div className="starter-actions">
          <div
            className="starter-action"
            onClick={handleRequestState}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleRequestState();
              }
            }}
            role="button"
            tabIndex={0}
          >
            Request Starter State
          </div>
          <div
            className="starter-action starter-action--secondary"
            onClick={handlePing}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handlePing();
              }
            }}
            role="button"
            tabIndex={0}
          >
            Send Ping #{pingCount + 1}
          </div>
        </div>
      </section>

      <section className="starter-card starter-log-panel">
        <h2 className="starter-section__title">Message Log</h2>
        <div className="starter-log">
          {logEntries.map((entry) => (
            <article className="starter-log__entry" key={entry.id}>
              <p className="starter-log__direction">{entry.direction}</p>
              <pre className="starter-log__payload">{entry.payload}</pre>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
