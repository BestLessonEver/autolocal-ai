import {validateInternalAuth} from '@/lib/internal-auth'
export function internalRequestError(request:Request):Response|null {
  const auth=validateInternalAuth(request)
  return auth.ok?null:Response.json({error:auth.message},{status:auth.status})
}
export function retiredWorkflow(message:string) {
  return Response.json({error:message,code:'workflow_retired',next:'/start'},{status:410})
}
