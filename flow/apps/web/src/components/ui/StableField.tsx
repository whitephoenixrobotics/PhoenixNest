'use client'

import { useEffect, useRef } from 'react'

/**
 * Text input / textarea that keeps the caret in place even though the node
 * re-renders constantly under Auto/Live mode.
 *
 * It's uncontrolled (the DOM owns the text), so frequent parent re-renders
 * never re-apply `value` and jump the caret to the end. An effect syncs the DOM
 * value from `value` only when the field is NOT focused (covers external changes
 * like field-picker inserts, undo/redo, or a flow load). Drop-in for a normal
 * controlled `<input>/<textarea>`: same `value` + `onChange` props.
 */
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> & { value?: string }
type AreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value?: string }

export function TextInput({ value = '', onChange, ...rest }: InputProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.value !== value) el.value = value
  })
  return <input ref={ref} defaultValue={value} spellCheck={false} onChange={onChange} {...rest} />
}

export function TextArea({ value = '', onChange, ...rest }: AreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.value !== value) el.value = value
  })
  return <textarea ref={ref} defaultValue={value} spellCheck={false} onChange={onChange} {...rest} />
}
