import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RiEditLine } from '@remixicon/react';
import { useState, useEffect, useCallback } from 'react';
import { Task } from '@/lib/task-view';
import { priorities } from '@/lib/priorities';
import { status } from '@/lib/status';
import { useTasksStore } from '@/store/tasks-store';
import { users } from '@/lib/users';
import { useCreateTaskStore } from '@/store/create-task-store';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { StatusSelector } from './status-selector';
import { PrioritySelector } from './priority-selector';
import { AssigneeSelector } from './assignee-selector';
import { TagSelector } from './tag-selector';
import { ranks } from '@/lib/task-view';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useCurrentTag, useTags } from '@/hooks/use-taskmaster-queries';
import { createTagFromData } from '@/lib/tags';
import { usePathname } from 'next/navigation';

export function CreateNewTask() {
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultStatus, openModal, closeModal } = useCreateTaskStore();
   const { addTask, getAllTasks } = useTasksStore();
   const { data: currentTag } = useCurrentTag();
   const { data: tagsData } = useTags();
   const pathname = usePathname();

   const generateUniqueIdentifier = useCallback(() => {
      const identifiers = getAllTasks().map((task) => task.identifier);
      let identifier = Math.floor(Math.random() * 999)
         .toString()
         .padStart(3, '0');
      while (identifiers.includes(`LNUI-${identifier}`)) {
         identifier = Math.floor(Math.random() * 999)
            .toString()
            .padStart(3, '0');
      }
      return identifier;
   }, [getAllTasks]);

   const createDefaultData = useCallback(() => {
      const identifier = generateUniqueIdentifier();
      // Auto-assign to the only member if there's exactly one
      const defaultAssignee = users.length === 1 ? users[0] : null;

      // Determine the tag based on the current route
      let tagName = 'master'; // Default to master

      // Check if we're on a /tag/[tagName] route
      const tagMatch = pathname.match(/^\/tag\/(.+)$/);
      if (tagMatch) {
         tagName = tagMatch[1];
      } else if (currentTag?.currentTag) {
         // Otherwise use the current tag from Taskmaster
         tagName = currentTag.currentTag;
      }

      // Find the tag data
      const tagData = tagsData?.find((t) => t.name === tagName);
      const tag = tagData
         ? createTagFromData(tagData.name, tagData.taskCount, tagData.metadata, 0)
         : createTagFromData('master', 0, undefined, 0);

      return {
         id: uuidv4(),
         identifier: `LNUI-${identifier}`,
         title: '',
         description: '',
         status: defaultStatus || status.find((s) => s.id === 'to-do')!,
         assignee: defaultAssignee,
         priority: priorities.find((p) => p.id === 'no-priority')!,
         labels: [],
         createdAt: new Date().toISOString(),
         cycleId: '',
         project: undefined,
         subtasks: [],
         rank: ranks[ranks.length - 1],
         tag,
      };
   }, [defaultStatus, generateUniqueIdentifier, currentTag, pathname, tagsData]);

   const [addTaskForm, setAddTaskForm] = useState<Task>(createDefaultData());

   useEffect(() => {
      setAddTaskForm(createDefaultData());
   }, [createDefaultData]);

   const createTask = () => {
      if (!addTaskForm.title) {
         toast.error('Title is required');
         return;
      }
      toast.success('Task created');
      addTask(addTaskForm);
      if (!createMore) {
         closeModal();
      }
      setAddTaskForm(createDefaultData());
   };

   return (
      <Dialog open={isOpen} onOpenChange={(value) => (value ? openModal() : closeModal())}>
         <DialogTrigger asChild>
            <Button className="size-8 shrink-0" variant="secondary" size="icon">
               <RiEditLine />
            </Button>
         </DialogTrigger>
         <DialogContent className="w-full sm:max-w-[750px] p-0 shadow-xl top-[30%]">
            <DialogHeader>
               <DialogTitle>
                  <div className="flex items-center px-4 pt-4 gap-2">
                     <TagSelector
                        tag={addTaskForm.tag}
                        onChange={(newTag) => setAddTaskForm({ ...addTaskForm, tag: newTag })}
                     />
                     <span className="text-sm text-muted-foreground">› New task</span>
                  </div>
               </DialogTitle>
            </DialogHeader>

            <div className="px-4 pb-0 space-y-3 w-full">
               <Input
                  className="border-none w-full shadow-none outline-none text-2xl font-medium px-0 h-auto focus-visible:ring-0 overflow-hidden text-ellipsis whitespace-normal break-words"
                  placeholder="Task title"
                  value={addTaskForm.title}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, title: e.target.value })}
               />

               <Textarea
                  className="border-none w-full shadow-none outline-none resize-none px-0 min-h-16 focus-visible:ring-0 break-words whitespace-normal overflow-wrap"
                  placeholder="Add description..."
                  value={addTaskForm.description}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, description: e.target.value })}
               />

               <div className="w-full flex items-center justify-start gap-1.5 flex-wrap">
                  <StatusSelector
                     status={addTaskForm.status}
                     onChange={(newStatus) => setAddTaskForm({ ...addTaskForm, status: newStatus })}
                  />
                  <PrioritySelector
                     priority={addTaskForm.priority}
                     onChange={(newPriority) =>
                        setAddTaskForm({ ...addTaskForm, priority: newPriority })
                     }
                  />
                  <AssigneeSelector
                     assignee={addTaskForm.assignee}
                     onChange={(newAssignee) =>
                        setAddTaskForm({ ...addTaskForm, assignee: newAssignee })
                     }
                  />
               </div>
            </div>
            <div className="flex items-center justify-between py-2.5 px-4 w-full border-t">
               <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                     <Switch
                        id="create-more"
                        checked={createMore}
                        onCheckedChange={setCreateMore}
                     />
                     <Label htmlFor="create-more">Create more</Label>
                  </div>
               </div>
               <Button
                  size="sm"
                  onClick={() => {
                     createTask();
                  }}
               >
                  Create task
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
