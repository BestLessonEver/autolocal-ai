import type { Metadata } from 'next'
import Workspace from '@/components/Workspace'
export const metadata:Metadata={title:'Explore the owner workspace',robots:{index:false,follow:true}}
export default function Demo(){return <Workspace demo/>}
