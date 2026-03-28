import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, '../scripts/rag_worker.py');

function resolvePythonCommand() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;

  const projectRoot = path.resolve(__dirname, '../..');
  const venvCandidates = [
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(projectRoot, '.venv', 'bin', 'python'),
  ];

  for (const candidate of venvCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === 'win32' ? 'py' : 'python';
}

const PYTHON_CMD = resolvePythonCommand();
console.log(`[RAG] Using Python interpreter: ${PYTHON_CMD}`);

function parseRagWorkerJson(rawOutput) {
  const trimmed = (rawOutput || '').trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('RAG worker did not return JSON');
    }

    const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonSlice);
  }
}

function runRagWorker(action, payload) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(PYTHON_CMD, [scriptPath, action]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(`[RAG_WORKER] ${chunk}`);
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Cannot start rag worker: ${error.message}`));
    });

    pythonProcess.on('close', (code) => {
      const trimmed = stdout.trim();

      if (code !== 0) {
        const reason = stderr.trim() || trimmed || `Process exited with code ${code}`;
        reject(new Error(reason));
        return;
      }

      try {
        const result = parseRagWorkerJson(trimmed);
        resolve(result);
      } catch (parseErr) {
        reject(new Error(`Invalid rag worker output: ${parseErr.message}`));
      }
    });

    pythonProcess.stdin.write(JSON.stringify(payload || {}));
    pythonProcess.stdin.end();
  });
}

export async function indexVideoScript(videoId, script) {
  return runRagWorker('ingest', {
    video_id: String(videoId),
    script: Array.isArray(script) ? script : [],
  });
}

export async function askVideoQuestion(videoId, question, history = []) {
  return runRagWorker('chat', {
    video_id: String(videoId),
    question,
    history,
  });
}
