#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { WebSocketServer } = require('ws');
const { watch } = require('chokidar');
const { readFileSync } = require('fs');
const { createServer } = require('http');
const path = require('path');

// Inline TaskmasterPaths logic
function getEnvTaskmasterPath() {
   // If TASKMASTER_DIR is set, use it directly (it should already point to .taskmaster)
   if (process.env.TASKMASTER_DIR) {
      return process.env.TASKMASTER_DIR;
   }

   // If we have USER_CWD, that's the project root, so append .taskmaster
   if (process.env.USER_CWD) {
      return path.join(process.env.USER_CWD, '.taskmaster');
   }

   // Fallback
   return path.join(process.cwd(), '.taskmaster');
}

// Mirrors the task loader's resolution: Settings → General → Default project
// root (read from the settings JSON mirror), falling back to the
// env-configured project.
function resolveWatchedTaskmasterDir() {
   const envTaskmasterDir = path.resolve(getEnvTaskmasterPath());
   try {
      const settingsRaw = readFileSync(
         path.join(envTaskmasterDir, 'task-studio-settings.json'),
         'utf-8'
      );
      const settings = JSON.parse(settingsRaw);
      const defaultRoot = settings && settings.general && settings.general.defaultProjectRoot;
      if (typeof defaultRoot === 'string' && defaultRoot.trim() !== '') {
         return path.join(path.resolve(defaultRoot), '.taskmaster');
      }
   } catch {
      // No settings file (or unreadable): watch the env-configured project.
   }
   return envTaskmasterDir;
}

const taskmasterDir = resolveWatchedTaskmasterDir();
const tasksPath = path.join(taskmasterDir, 'tasks', 'tasks.json');
const statePath = path.join(taskmasterDir, 'state.json');
const configPath = path.join(taskmasterDir, 'config.json');

const port = process.env.NEXT_PUBLIC_WS_PORT ? parseInt(process.env.NEXT_PUBLIC_WS_PORT) : 5566;
const server = createServer();
const wss = new WebSocketServer({ server });

console.log(`Watching Taskmaster files in ${taskmasterDir}`);

// Watch the .taskmaster directory
const watcher = watch(
   [tasksPath, statePath, configPath, path.join(taskmasterDir, 'reports', '**/*.json')],
   {
      persistent: true,
      ignoreInitial: true,
   }
);

// Debounce timer to handle rapid file changes
let debounceTimer = null;

function broadcast(message) {
   wss.clients.forEach((client) => {
      if (client.readyState === 1) {
         // WebSocket.OPEN
         client.send(message);
      }
   });
}

// Broadcast changes to all connected clients ('add' covers files created
// after startup, e.g. a fresh `task-master init`).
function handleFileEvent(filepath) {
   // Clear existing timer
   if (debounceTimer) {
      clearTimeout(debounceTimer);
   }

   // Debounce file reads to avoid reading incomplete writes
   debounceTimer = setTimeout(() => {
      try {
         const fileContent = readFileSync(filepath, 'utf-8');

         // Skip empty files
         if (!fileContent.trim()) {
            console.log('File is empty, skipping broadcast');
            return;
         }

         // Try to parse JSON
         let parsedContent;
         try {
            parsedContent = JSON.parse(fileContent);
         } catch (parseError) {
            // Likely a partial write; the next change event re-reads it.
            console.error('Invalid JSON in file, skipping broadcast:', parseError);
            return;
         }

         broadcast(
            JSON.stringify({
               type: 'file-change',
               path: filepath,
               content: parsedContent,
               timestamp: new Date().toISOString(),
            })
         );
      } catch (error) {
         console.error('Error reading file:', error);
      }
   }, 100); // 100ms debounce
}

watcher.on('change', handleFileEvent);
watcher.on('add', handleFileEvent);
watcher.on('unlink', (filepath) => {
   // Deleted file: tell clients to refetch so the UI shows the real
   // (missing-file) state instead of stale data.
   broadcast(
      JSON.stringify({
         type: 'file-change',
         path: filepath,
         deleted: true,
         timestamp: new Date().toISOString(),
      })
   );
});

wss.on('connection', (ws) => {
   console.log('Client connected');

   // Send initial data
   try {
      // Send tasks if file exists
      try {
         const tasks = JSON.parse(readFileSync(tasksPath, 'utf-8'));
         ws.send(
            JSON.stringify({
               type: 'initial-tasks',
               tasks,
               timestamp: new Date().toISOString(),
            })
         );
      } catch {
         console.log('Tasks file not found or invalid');
      }

      // Send state if file exists
      try {
         const state = JSON.parse(readFileSync(statePath, 'utf-8'));
         ws.send(
            JSON.stringify({
               type: 'initial-state',
               state,
               timestamp: new Date().toISOString(),
            })
         );
      } catch {
         console.log('State file not found or invalid');
      }

      // Send config if file exists
      try {
         const config = JSON.parse(readFileSync(configPath, 'utf-8'));
         ws.send(
            JSON.stringify({
               type: 'initial-config',
               config,
               timestamp: new Date().toISOString(),
            })
         );
      } catch {
         console.log('Config file not found or invalid');
      }
   } catch (error) {
      console.error('Error sending initial data:', error);
   }

   ws.on('close', () => {
      console.log('Client disconnected');
   });
});

server.listen(port, () => {
   console.log(`WebSocket server listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
   console.log('\nShutting down WebSocket server...');
   watcher.close();
   wss.close();
   server.close();
   process.exit(0);
});

process.on('SIGTERM', () => {
   watcher.close();
   wss.close();
   server.close();
   process.exit(0);
});
