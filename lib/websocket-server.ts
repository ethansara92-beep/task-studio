import { WebSocketServer } from 'ws';
import { watch } from 'chokidar';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import path from 'path';
import { getTaskmasterPath } from './taskmaster-paths';

/**
 * Resolves the project root whose files should be watched. Mirrors the task
 * loader's resolution: Settings → General → Default project root, falling
 * back to the root the server was started in. The settings JSON mirror is
 * read directly because this runs in a separate lightweight process.
 */
function resolveWatchedTaskmasterDir(): string {
   const envTaskmasterDir = path.resolve(getTaskmasterPath());
   try {
      const settingsRaw = readFileSync(
         path.join(envTaskmasterDir, 'task-studio-settings.json'),
         'utf-8'
      );
      const settings = JSON.parse(settingsRaw);
      const defaultRoot = settings?.general?.defaultProjectRoot;
      if (typeof defaultRoot === 'string' && defaultRoot.trim() !== '') {
         return path.join(path.resolve(defaultRoot), '.taskmaster');
      }
   } catch {
      // No settings file (or unreadable): watch the env-configured project.
   }
   return envTaskmasterDir;
}

export function createTaskmasterWebSocketServer(port: number = 5566) {
   const server = createServer();
   const wss = new WebSocketServer({ server });

   const taskmasterDir = resolveWatchedTaskmasterDir();
   const tasksPath = path.join(taskmasterDir, 'tasks', 'tasks.json');
   const statePath = path.join(taskmasterDir, 'state.json');
   const configPath = path.join(taskmasterDir, 'config.json');

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
   let debounceTimer: NodeJS.Timeout | null = null;

   const broadcast = (message: string) => {
      wss.clients.forEach((client) => {
         if (client.readyState === 1) {
            // WebSocket.OPEN
            client.send(message);
         }
      });
   };

   // Broadcast changes to all connected clients ('add' covers files created
   // after startup, e.g. a fresh `task-master init`).
   const handleFileEvent = (filepath: string) => {
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
   };

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

   return { server, wss, watcher };
}
