import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dockerAvailableCache: boolean | null = null;

async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) return dockerAvailableCache;
  if (process.env.CONTAINER_RUNTIME === 'none' || process.env.CONTAINER_RUNTIME === 'native') {
    dockerAvailableCache = false;
    return false;
  }
  return new Promise((resolve) => {
    try {
      const check = spawn(process.env.CONTAINER_RUNTIME || 'docker', ['--version'], { stdio: 'ignore' });
      check.on('error', () => {
        dockerAvailableCache = false;
        resolve(false);
      });
      check.on('close', (code) => {
        dockerAvailableCache = code === 0;
        resolve(dockerAvailableCache);
      });
    } catch {
      dockerAvailableCache = false;
      resolve(false);
    }
  });
}

export async function runPython(code: string): Promise<{ stdout: string; stderr: string; exitCode: number; executionTimeMs: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'devchamber-py-'));
  const file = join(dir, 'main.py');
  try {
    await chmod(dir, 0o755);
  } catch {
    // Windows may ignore chmod errors
  }
  await writeFile(file, code, { mode: 0o644, encoding: 'utf8' });

  const startTime = Date.now();
  const useDocker = await isDockerAvailable();

  try {
    if (useDocker) {
      return await new Promise<{ stdout: string; stderr: string; exitCode: number; executionTimeMs: number }>((resolve, reject) => {
        const docker = spawn(
          process.env.CONTAINER_RUNTIME || 'docker',
          [
            'run',
            '--rm',
            '--network', 'none',
            '--memory', '128m',
            '--cpus', '0.5',
            '--pids-limit', '32',
            '--read-only',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
            '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges',
            '--user', '65534:65534',
            '--mount', `type=bind,src=${dir},dst=/work,readonly`,
            '--workdir', '/work',
            'python:3.12-alpine',
            'python', '-I', '-u', '/work/main.py',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );

        let stdout = '';
        let stderr = '';
        let settled = false;

        const finish = (fn: () => void) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            fn();
          }
        };

        const timer = setTimeout(() => {
          docker.kill('SIGKILL');
          finish(() => reject(new Error('Execution timed out after 5 seconds')));
        }, 5000);

        docker.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
          if (stdout.length > 16_384) {
            docker.kill('SIGKILL');
            finish(() => reject(new Error('Output limit exceeded (16 KB)')));
          }
        });

        docker.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString().slice(0, 16_384 - stderr.length);
        });

        docker.on('error', (error) => {
          finish(() => reject(new Error(`Sandbox runner error: ${error.message}`)));
        });

        docker.on('close', (exitCode) => {
          finish(() => resolve({ stdout, stderr, exitCode: exitCode ?? 1, executionTimeMs: Date.now() - startTime }));
        });
      });
    } else {
      // Direct isolated Python process execution with restricted environment and strict limits
      return await new Promise<{ stdout: string; stderr: string; exitCode: number; executionTimeMs: number }>((resolve, reject) => {
        // Strip sensitive environment secrets
        const cleanEnv: NodeJS.ProcessEnv = {
          PATH: process.env.PATH,
          PYTHONUNBUFFERED: '1',
          PYTHONDONTWRITEBYTECODE: '1',
          SYSTEMROOT: process.env.SYSTEMROOT,
          WINDIR: process.env.WINDIR,
          TEMP: dir,
          TMP: dir,
        };

        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const pyProc = spawn(pythonCmd, ['-u', file], {
          cwd: dir,
          env: cleanEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const finish = (fn: () => void) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            fn();
          }
        };

        const timer = setTimeout(() => {
          pyProc.kill();
          finish(() => reject(new Error('Execution timed out after 5 seconds (infinite loop protection)')));
        }, 5000);

        pyProc.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
          if (stdout.length > 16_384) {
            pyProc.kill();
            finish(() => reject(new Error('Output limit exceeded (16 KB)')));
          }
        });

        pyProc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString().slice(0, 16_384 - stderr.length);
        });

        pyProc.on('error', (error) => {
          finish(() => reject(new Error(`Python interpreter not found or failed to launch: ${error.message}`)));
        });

        pyProc.on('close', (exitCode) => {
          finish(() => resolve({ stdout, stderr, exitCode: exitCode ?? 0, executionTimeMs: Date.now() - startTime }));
        });
      });
    }
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}
