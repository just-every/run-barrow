import type { ReactNode } from 'react'
export function CardConsent({checked,onChange,disabled,children}:{checked:boolean;onChange:(checked:boolean)=>void;disabled:boolean;children:ReactNode}) {
 return <label style={{display:'flex',alignItems:'flex-start',gap:10}}><input type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} style={{width:20,height:20,minHeight:20,padding:0,flex:'0 0 20px',margin:'2px 0 0'}}/><span>{children}</span></label>
}
