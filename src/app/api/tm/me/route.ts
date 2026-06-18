import { getCurrentTmUser, unauthorizedResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentTmUser();
  if (!user) return unauthorizedResponse();
  return okResponse({
    user_id:       user.user_id,
    full_name:     user.full_name,
    email:         user.email,
    role:          user.role,
    department_id: user.department_id,
  });
}
