import { describe, expect, it } from 'vitest';
import {
   TaskLoadError,
   countTasks,
   extractTagContexts,
   normalizeTask,
   parseTaskmasterTasks,
} from '@/lib/taskmaster/parse-taskmaster-tasks';

// Mirrors the real shape of this repo's .taskmaster/tasks/tasks.json.
const TAGGED_DOC = {
   master: {
      tasks: [
         {
            id: 3,
            title: 'Define TypeScript Data Models',
            description: 'Create mapping utilities',
            status: 'pending',
            dependencies: [],
            priority: 'medium',
            details: 'Create /lib/taskmaster-mapping.ts',
            testStrategy: 'Test mapping functions',
            subtasks: [
               {
                  id: 1,
                  title: 'Analyze existing interfaces',
                  description: '',
                  status: 'pending',
                  dependencies: [],
               },
            ],
         },
      ],
      metadata: { created: '2025-03-01', description: 'Main tag' },
   },
   'feature-x': {
      tasks: [{ id: 1, title: 'Kickoff', status: 'in-progress', priority: 'high' }],
   },
};

describe('extractTagContexts', () => {
   it('parses the tagged format with metadata', () => {
      const contexts = extractTagContexts(TAGGED_DOC);
      expect(Object.keys(contexts)).toEqual(['master', 'feature-x']);
      expect(contexts.master.tasks).toHaveLength(1);
      expect(contexts.master.metadata).toEqual({ created: '2025-03-01', description: 'Main tag' });
      expect(contexts['feature-x'].metadata).toBeNull();
   });

   it('parses the legacy flat { tasks: [...] } format as the master tag', () => {
      const contexts = extractTagContexts({ tasks: [{ id: 7, title: 'Legacy' }] });
      expect(Object.keys(contexts)).toEqual(['master']);
      expect(contexts.master.tasks[0].title).toBe('Legacy');
   });

   it('parses a bare array of tasks as the master tag', () => {
      const contexts = extractTagContexts([{ id: 1, title: 'A' }, { id: 2, title: 'B' }]);
      expect(contexts.master.tasks).toHaveLength(2);
   });

   it('accepts an empty object (no tags yet) and an empty array', () => {
      expect(extractTagContexts({})).toEqual({});
      expect(extractTagContexts([]).master.tasks).toEqual([]);
   });

   it('rejects unknown shapes with UNSUPPORTED_FORMAT', () => {
      for (const doc of ['a string', 42, null, { foo: 'bar' }, [{ notATask: true }]]) {
         try {
            extractTagContexts(doc);
            expect.unreachable(`should have thrown for ${JSON.stringify(doc)}`);
         } catch (error) {
            expect(error).toBeInstanceOf(TaskLoadError);
            expect((error as TaskLoadError).code).toBe('UNSUPPORTED_FORMAT');
         }
      }
   });
});

describe('normalizeTask', () => {
   it('normalizes ids/dependencies to strings and keeps raw', () => {
      const raw = TAGGED_DOC.master.tasks[0];
      const normalized = normalizeTask(raw);
      expect(normalized).toMatchObject({
         id: '3',
         title: 'Define TypeScript Data Models',
         status: 'pending',
         priority: 'medium',
         dependencies: [],
         details: 'Create /lib/taskmaster-mapping.ts',
         testStrategy: 'Test mapping functions',
      });
      expect(normalized.subtasks).toHaveLength(1);
      expect(normalized.subtasks[0].id).toBe('1');
      expect(normalized.raw).toBe(raw);
   });

   it('applies safe defaults for missing fields', () => {
      const normalized = normalizeTask({ id: 9 });
      expect(normalized.status).toBe('pending');
      expect(normalized.priority).toBe('medium');
      expect(normalized.title).toBe('');
      expect(normalized.subtasks).toEqual([]);
   });

   it('stringifies numeric dependencies', () => {
      const normalized = normalizeTask({ id: 1, dependencies: [2, '3.1'] });
      expect(normalized.dependencies).toEqual(['2', '3.1']);
   });
});

describe('parseTaskmasterTasks / countTasks', () => {
   it('returns normalized tasks per tag', () => {
      const parsed = parseTaskmasterTasks(TAGGED_DOC);
      expect(parsed.master.tasks[0].id).toBe('3');
      expect(parsed['feature-x'].tasks[0].status).toBe('in-progress');
   });

   it('counts tasks including subtasks', () => {
      expect(countTasks(extractTagContexts(TAGGED_DOC))).toBe(3);
   });
});
