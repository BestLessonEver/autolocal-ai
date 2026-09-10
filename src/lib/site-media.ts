import type {SupabaseClient} from '@supabase/supabase-js'
import {ApiError} from '@/lib/owner-access'
export async function uploadImage(file:File,db:SupabaseClient,ownerId:string) {
  if(!file || typeof file.arrayBuffer!=='function') throw new ApiError(400,'Choose an image.')
  if(file.size>5*1024*1024 || file.size<12) throw new ApiError(400,'Choose an image up to 5 MB.')
  const bytes=Buffer.from(await file.arrayBuffer())
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255
  const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
  const type=png?'image/png':jpg?'image/jpeg':webp?'image/webp':null
  if(!type || file.type!==type) throw new ApiError(400,'Upload a PNG, JPEG or WebP image.')
  const path=ownerId+'/'+crypto.randomUUID()+'.'+(png?'png':jpg?'jpg':'webp')
  const {error}=await db.storage.from('client-assets').upload(path,bytes,{contentType:type,upsert:false})
  if(error) throw new ApiError(503,'Your image could not be uploaded. Please try again.')
  const {data}=db.storage.from('client-assets').getPublicUrl(path)
  return data.publicUrl
}
