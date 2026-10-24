export interface StoredServerAccount {
  url: string;
  serverId: string;
  userId: string;
  email: string;
  role: 'user' | 'admin';
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  color: string;
  generation?: number;
  contentId?: string;
  server?: StoredServerAccount;
}
