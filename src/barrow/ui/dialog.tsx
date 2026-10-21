import { createPortal } from 'react-dom'
import { useEffect, useRef, type ReactNode } from 'react'

export function Dialog({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  return createPortal(<dialog ref={dialog} className="barrow br-dialog" aria-label={title} onSubmit={event=>event.stopPropagation()} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h2>{title}</h2>{children}
  </dialog>,document.body)
}
