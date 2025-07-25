export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export const ADMIN_ROLES = [UserRole.ADMIN] as const; 