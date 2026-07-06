export interface User {
   id: string;
   name: string;
   avatarUrl: string;
   email: string;
   status: 'online' | 'offline' | 'away';
   role: 'Member' | 'Admin' | 'Guest';
   joinedDate: string;
   teamIds: string[];
}

const avatarUrl = (seed: string) => `https://api.dicebear.com/9.x/glass/svg?seed=${seed}`;

export const statusUserColors = {
   online: '#00cc66',
   offline: '#969696',
   away: '#ffcc00',
};

export const users: User[] = [
   {
      id: 'dev',
      name: 'Claude Code',
      avatarUrl: avatarUrl('claudecode1'),
      email: 'claude_code',
      status: 'online',
      role: 'Admin',
      joinedDate: '2025-01-01',
      teamIds: ['CLAUDE'],
   },
];
