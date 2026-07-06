import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { resolveActiveProjectRoot } from '@/lib/taskmaster/project-root';

export async function GET() {
   try {
      const projectRoot = await resolveActiveProjectRoot();
      const configPath = path.join(projectRoot, '.taskmaster', 'config.json');

      try {
         const configData = await fs.readFile(configPath, 'utf-8');
         const config = JSON.parse(configData);

         return NextResponse.json({
            success: true,
            data: config,
            timestamp: new Date().toISOString(),
         });
      } catch (error: any) {
         // If config doesn't exist, return empty config instead of error
         if (error.code === 'ENOENT') {
            return NextResponse.json({
               success: true,
               data: {
                  global: {
                     projectName: 'Task Studio',
                  },
               },
               timestamp: new Date().toISOString(),
            });
         }
         throw error;
      }
   } catch (error) {
      console.error('Error reading config:', error);
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to read config',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
