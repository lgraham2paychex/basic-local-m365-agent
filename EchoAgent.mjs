import { AgentApplication } from '@microsoft/agents-hosting';
// Additive import (test-only /anomaly flow): RouteRank lets the anomaly-setup
// route out-rank the existing catch-all message handler without modifying it.
import { RouteRank } from '@microsoft/agents-hosting';
import { IPC_ANOMALY_ORCH_BASE_URL, IPC_ANOMALY_ORCH_THREADS_URL, IPC_ANOMALY_ORCH_INFO_URL, IPC_ANOMALY_ORCH_API_KEY, IPC_ANOMALY_ORCH_ASSISTANT_ID } from './config.mjs';



export class EchoAgent extends AgentApplication {
  constructor(storage) {
    super({ storage });

    this.storage = storage;

    this.onConversationUpdate('membersAdded', this._help);
    this.onMessage('/help', this._help);
    this.onMessage('/version', this._version);
    this.onMessage('/langchain', this._langchainMode);
    this.onMessage('/echo', this._echoMode);
    this.onMessage('/connection', this._checkConnection);
    
    this.onActivity('message', this._routeMessage);

    // --- Additive, test-only feature: /anomaly -----------------------------
    // Skips the payroll flow entirely and jumps the IPC Anomaly Orchestrator
    // straight to anomaly detection. Collects the client, user GUID, and an
    // optional payroll ID (the identifiers the Bank Account Payment Security
    // service needs), then runs the orchestrator with a LangGraph `command`
    // (update the graph State + goto detect_anomalies).
    //
    // The follow-up values are captured by a high-priority (RouteRank.First)
    // route whose selector only matches while a setup is in progress AND the
    // text is not another slash-command. Because route evaluation is
    // first-match-wins, this never affects the existing _routeMessage handler
    // outside of the /anomaly collection turns.
    this._anomalySetups = new Map();
    this.onMessage('/anomaly', this._anomalyStart, undefined, RouteRank.First);
    this.onActivity(
      async (context) =>
        context.activity.type === 'message' &&
        this._anomalySetups.has(context.activity.conversation?.id) &&
        !String(context.activity.text ?? '').trim().startsWith('/'),
      this._anomalyCollect,
      undefined,
      RouteRank.First
    );
  }

  _version = async (context) => await context.sendActivity(`Paychex M365 Basic Local Chatbot Agent version 0.0.1`);

  _help = async (context) => await context.sendActivity(`Welcome to the Echo Agent sample 🚀. 
      Type /help for help or send a message to see the echo feature in action.
	  Use /langchain to chat with the LangChain agent configured in config.mjs.
	  User /echo to return to Echo mode.`);


yes
  // Enable LangChain routing mode by setting state.conversation.modeLangchain = true
  _langchainMode = async (context, state) => {
    try {
      state.setValue('conversation.modeLangchain', true);
      await state.save(context, this.storage);
      await context.sendActivity(`LangChain mode enabled. I will now route your messages through LangChain. Send /echo to switch back to Echo mode.`);
    } catch (err) {
      console.error('_langchainMode error', err);
    }
  };

  // Disable LangChain routing mode by un-setting state.conversation.modeLangchain when present
  _echoMode = async (context, state) => {
    try {
      // Prefer a deletion API if available, otherwise set to null
      if (typeof state.deleteValue === 'function') {
        state.deleteValue('conversation.modeLangchain');
      } else if (typeof state.removeValue === 'function') {
        state.removeValue('conversation.modeLangchain');
      } else {
        state.setValue('conversation.modeLangchain', null);
      }
      await state.save(context, this.storage);
      await context.sendActivity(`Echo mode enabled. I will now echo your messages back to you. Send /langchain to switch back to LangChain mode.`);
    } catch (err) {
      console.error('_echoMode error', err);
    }
  };

  //https://langchain.paychexai.nonprod.azure.payx/api/v1/info
  // Check connection to LangChain info endpoint and report status
  _checkConnection = async (context) => {
    const url = IPC_ANOMALY_ORCH_INFO_URL;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (IPC_ANOMALY_ORCH_API_KEY) {
        headers['x-api-key'] = IPC_ANOMALY_ORCH_API_KEY;
      }

      const res = await fetch(url, { method: 'GET', headers });
      if (res.status === 200) {
        const data = await res.json();
        await context.sendActivity(`Connection to Langchain successful. Version ${data?.version}`);
        return;
      }

      // For 400/500 or other non-200 statuses
      const body = await res.text().catch(() => '');
      console.error('_checkConnection non-200 status', res.status, body);
      await context.sendActivity(`Connection to LangChain failed (HTTP ${res.status}) at ${url}.`);
    } catch (err) {
      const detail = err?.cause?.code || err?.code || err?.message || String(err);
      console.error('_checkConnection error', err);
      await context.sendActivity(`Connection to LangChain failed at ${url}: ${detail}`);
    }
  };

  // Route incoming messages based on `state` flag `conversation.modeLangchain`.
  // If `conversation.modeLangchain` is true, delegate to `_handleMessage`, otherwise `_echo`.
  _routeMessage = async (context, state) => {
    try {
      const isLangchain = state.getValue('conversation.modeLangchain') === true;
      if (isLangchain) {
        await this._handleMessage(context, state);
      } else {
        await this._echo(context, state);
      }
    } catch (err) {
      console.error('_routeMessage error', err);
      // fallback to echo on error
      await this._echo(context, state);
    }
  };

  _echo = async (context, state) => {
    let counter = state.getValue('conversation.counter') || 0;
    console.log(`Echoing back message: ${context.activity.text}, counter: ${counter}`);
    await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`);
    state.setValue('conversation.counter', counter);
    await state.save(context, this.storage);
  };

  _handleMessage = async (context, state) => {
    // try to read threadId from user state
    let threadId = state.getValue('user.threadId') || null;

    if (!threadId) {
      // create a new thread and persist it to user state
      threadId = await this.createThread();
      if (threadId) {
        state.setValue('user.threadId', threadId);
      }
    }

    if (threadId) {
      // send the user's message to the thread and return the assistant reply
      const assistantReply = await this.runThread(threadId, context.activity.text);
      if (assistantReply) {
        await context.sendActivity(assistantReply);
      } else {
        await context.sendActivity(`Thread created with ID: ${threadId} (no reply)`);
      }
    } else {
      await context.sendActivity(`Failed to create thread.`);
    }
  }  

  // Create a new thread by POSTing to `${BASE_URL}/threads`.
  // Returns the `thread_id` string on success, or `null` on failure.
  createThread = async () => {
    const BASE_URL = IPC_ANOMALY_ORCH_THREADS_URL;
    const url = BASE_URL;
    const headers = {
      'x-api-key': IPC_ANOMALY_ORCH_API_KEY,
      'Content-Type': 'application/json'
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('createThread non-ok status', res.status, 'url', url, body);
        return null;
      }
      const data = await res.json();
      return data?.thread_id ?? null;
    } catch (err) {
      console.error('createThread error', err?.cause?.code || err?.code || err?.message || err, 'url', url);
      return null;
    }
  };

  // Run a thread run and wait for completion, returning the last message content.
  runThread = async (threadId, content) => {
    const url = `${IPC_ANOMALY_ORCH_THREADS_URL}/${threadId}/runs/wait`;
    const body = {
      assistant_id: IPC_ANOMALY_ORCH_ASSISTANT_ID,
      input: {
        messages: [
          {
            role: 'human',
            content: content
          }
        ]
      }
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    if (IPC_ANOMALY_ORCH_API_KEY) {
      headers['x-api-key'] = IPC_ANOMALY_ORCH_API_KEY;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      const messages = data?.messages;
      if (Array.isArray(messages) && messages.length) {
        return messages[messages.length - 1]?.content ?? null;
      }
      return null;
    } catch (err) {
      console.error('runThread error', err);
      return null;
    }
  };

  // ------------------------------------------------------------------------
  // /anomaly test flow (additive) — bypass payroll, run anomaly detection.
  // None of the methods below modify existing behavior; they only add a new
  // command path guarded by the RouteRank.First selector registered above.
  // ------------------------------------------------------------------------

  // Turn 1: start collecting the identifiers BAPS needs.
  _anomalyStart = async (context) => {
    const convId = context.activity.conversation?.id;
    this._anomalySetups.set(convId, { step: 'client', client: '', userguid: '', payroll: '' });
    await context.sendActivity(
      `Anomaly detection test mode. I'll skip payroll and jump straight to anomaly detection.\n\n` +
      `First, enter the **client** (cltacctnbr / client_id):`
    );
  };

  // Turns 2-4: capture each value in order, then run anomaly detection.
  _anomalyCollect = async (context) => {
    const convId = context.activity.conversation?.id;
    const setup = this._anomalySetups.get(convId);
    if (!setup) return; // safety; the route selector should prevent this

    const text = String(context.activity.text ?? '').trim();

    if (setup.step === 'client') {
      setup.client = text;
      setup.step = 'userguid';
      await context.sendActivity(`Got it. Now enter the **user GUID**:`);
      return;
    }

    if (setup.step === 'userguid') {
      setup.userguid = text;
      setup.step = 'payroll';
      await context.sendActivity(`Thanks. Finally, enter an **optional payroll ID** (or type "skip"):`);
      return;
    }

    if (setup.step === 'payroll') {
      setup.payroll = /^skip$/i.test(text) ? '' : text;
      this._anomalySetups.delete(convId);
      await this._runAnomaly(context, setup);
      return;
    }
  };

  // Create a fresh thread, then run it so the graph enters directly at
  // detect_anomalies and return the anomaly summary.
  _runAnomaly = async (context, { client, userguid, payroll }) => {
    await context.sendActivity(
      `Running anomaly detection for client "${client}"` +
      (payroll ? ` (payroll ${payroll})` : ` (no payroll ID)`) + `...`
    );

    const threadId = await this.createThread();
    if (!threadId) {
      await context.sendActivity(`Failed to create a thread for anomaly detection.`);
      return;
    }

    const reply = await this.runAnomalyDetection(threadId, { client, userguid, payroll });
    if (reply === null) {
      await context.sendActivity(
        `Anomaly detection run failed (could not reach detect_anomalies). ` +
        `Check the orchestrator logs; not falling back into the normal payroll flow.`
      );
      return;
    }
    await context.sendActivity(reply || `Anomaly detection ran, but no message was returned (thread ${threadId}).`);
  };

  // Run the orchestrator so it jumps straight to anomaly detection, using a
  // LangGraph run `command` (POST /threads/{id}/runs/wait). `command.update`
  // writes full graph State fields — including `phase` and the BAPS
  // identifiers — which the run input schema (InputState) does NOT accept, and
  // `command.goto` directs execution to the detect_anomalies node. This needs
  // no orchestrator-side change and no separate state-seeding call.
  // Returns the last message content on success, or null on HTTP/transport error.
  runAnomalyDetection = async (threadId, { client, userguid, payroll }) => {
    const url = `${IPC_ANOMALY_ORCH_THREADS_URL}/${threadId}/runs/wait`;
    const headers = { 'Content-Type': 'application/json' };
    if (IPC_ANOMALY_ORCH_API_KEY) {
      headers['x-api-key'] = IPC_ANOMALY_ORCH_API_KEY;
    }
    const body = {
      assistant_id: IPC_ANOMALY_ORCH_ASSISTANT_ID,
      command: {
        update: {
          phase: 'submit_intent',
          client_id: client,
          cltacctnbr: client,
          user_guid: userguid,
          payroll_id: payroll,
        },
        goto: 'detect_anomalies',
      },
    };
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('runAnomalyDetection non-ok status', res.status, 'url', url, errBody);
        return null;
      }
      const data = await res.json();
      const messages = data?.messages;
      if (Array.isArray(messages) && messages.length) {
        return messages[messages.length - 1]?.content ?? '';
      }
      return '';
    } catch (err) {
      console.error('runAnomalyDetection error', err?.cause?.code || err?.code || err?.message || err, 'url', url);
      return null;
    }
  };

}

