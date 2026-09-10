import { createAdminClient } from '@/lib/supabase/admin'
import { createLeadSubmitHandler } from '@/lib/lead-intake'
export const POST = createLeadSubmitHandler(createAdminClient)
