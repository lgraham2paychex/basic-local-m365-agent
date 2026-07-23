export const IPC_ANOMALY_ORCH_BASE_URL = process.env.IPC_ANOMALY_ORCH_BASE_URL || 'https://langchain.paychexai.dev.azure.payx';
// Path portion for the threads endpoint. Local `langgraph dev` serves threads at
// the root (`/threads`); the deployed bridge routes per-deployment under
// `/lgp/<deployment>/threads`. Override with IPC_ANOMALY_ORCH_THREADS_URL.
export const IPC_ANOMALY_ORCH_THREADS_URL = IPC_ANOMALY_ORCH_BASE_URL + (process.env.IPC_ANOMALY_ORCH_THREADS_URL || '/lgp/ipc-anomaly-orchestrator-ag-85b66d5b2b1f58faa3168a823240733a/threads')
// Path portion for the info/health endpoint. Local `langgraph dev` serves `/info`;
// the deployed platform serves `/api/v1/info`. Override with IPC_ANOMALY_ORCH_INFO_URL.
export const IPC_ANOMALY_ORCH_INFO_URL = IPC_ANOMALY_ORCH_BASE_URL + (process.env.IPC_ANOMALY_ORCH_INFO_URL || '/api/v1/info');
export const IPC_ANOMALY_ORCH_API_KEY = process.env.IPC_ANOMALY_ORCH_API_KEY || '<your Personal Access Token>';
export const IPC_ANOMALY_ORCH_ASSISTANT_ID = process.env.IPC_ANOMALY_ORCH_ASSISTANT_ID || 'ipc-anomaly-orchestrator-agent';