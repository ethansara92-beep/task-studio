import { Status } from '@/lib/status';
import { create } from 'zustand';

interface CreateTaskState {
   isOpen: boolean;
   defaultStatus: Status | null;

   // Actions
   openModal: (status?: Status) => void;
   closeModal: () => void;
   setDefaultStatus: (status: Status | null) => void;
}

export const useCreateTaskStore = create<CreateTaskState>((set) => ({
   // Initial state
   isOpen: false,
   defaultStatus: null,

   // Actions
   openModal: (status) => set({ isOpen: true, defaultStatus: status || null }),
   closeModal: () => set({ isOpen: false }),
   setDefaultStatus: (status) => set({ defaultStatus: status }),
}));
