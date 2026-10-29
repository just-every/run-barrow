import { createPortal } from 'react-dom'
import { useEffect, useRef, type ReactNode } from 'react'

export function Dialog({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement
    const node = dialog.current
    node?.showModal()
    return () => { node?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  return createPortal(<dialog ref={dialog} tabIndex={-1} className="barrow br-dialog" aria-label={title} onSubmit={event=>event.stopPropagation()} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h2>{title}</h2>{children}
  </dialog>,document.body)
}
