import type { Metadata } from 'next'
import Workspace from '@/components/Workspace'
export const metadata:Metadata={title:'Your business workspace',robots:{index:false,follow:false}}
export default function Dashboard(){return <Workspace/>}
