export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  schoolIds: string[];
}
