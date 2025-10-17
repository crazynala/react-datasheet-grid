import { useCallback, useMemo, useRef, useState } from 'react'

type CompareFn = (a: any, b: any) => boolean

export type DataSheetControllerOptions<T> = {
  sanitize?: (rows: T[]) => any
  compare?: CompareFn
  historyLimit?: number
}

export type DataSheetControllerState = {
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  historyLength: number
  index: number
}

export type DataSheetController<T> = {
  value: T[]
  onChange: (next: T[]) => void
  setValue: (next: T[]) => void
  getValue: () => T[]
  reset: (nextInitial?: T[]) => void
  setInitial: (nextInitial: T[]) => void
  undo: () => void
  redo: () => void
  state: DataSheetControllerState
}

const defaultSanitize = (rows: any[]) => rows
const defaultCompare: CompareFn = (a: any, b: any) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return a === b
  }
}

export function useDataSheetController<T>(
  initial: T[],
  opts?: DataSheetControllerOptions<T>
): DataSheetController<T> {
  const sanitize = opts?.sanitize ?? defaultSanitize
  const compare = opts?.compare ?? defaultCompare
  const historyLimit = Math.max(1, opts?.historyLimit ?? 50)

  const initialRawRef = useRef<T[]>(initial)
  const initialSnapRef = useRef<any>(sanitize(initial))

  const [value, _setValue] = useState<T[]>(initial)

  type Frame = { raw: T[]; snap: any }
  const historyRef = useRef<{ stack: Frame[]; idx: number }>({
    stack: [{ raw: initial, snap: initialSnapRef.current }],
    idx: 0,
  })

  const top = () => historyRef.current.stack[historyRef.current.idx]

  const push = useCallback(
    (next: T[]) => {
      const snap = sanitize(next)
      if (compare(snap, top().snap)) {
        _setValue(next)
        return
      }
      // drop redo tail
      const { stack, idx } = historyRef.current
      const base = stack.slice(0, idx + 1)
      base.push({ raw: next, snap })
      // enforce limit (keep most recent frames)
      const excess = Math.max(0, base.length - historyLimit)
      const trimmed = excess ? base.slice(excess) : base
      const newIdx = trimmed.length - 1
      historyRef.current = { stack: trimmed, idx: newIdx }
      _setValue(next)
    },
    [compare, historyLimit, sanitize]
  )

  const setValue = useCallback((next: T[]) => push(next), [push])

  const getValue = useCallback(
    () => historyRef.current.stack[historyRef.current.idx].raw,
    []
  )

  const reset = useCallback(
    (nextInitial?: T[]) => {
      const raw = nextInitial ?? initialRawRef.current
      const snap = sanitize(raw)
      initialRawRef.current = raw
      initialSnapRef.current = snap
      historyRef.current = { stack: [{ raw, snap }], idx: 0 }
      _setValue(raw)
    },
    [sanitize]
  )

  const setInitial = useCallback(
    (nextInitial: T[]) => {
      initialRawRef.current = nextInitial
      initialSnapRef.current = sanitize(nextInitial)
    },
    [sanitize]
  )

  const undo = useCallback(() => {
    if (historyRef.current.idx <= 0) return
    historyRef.current.idx -= 1
    _setValue(historyRef.current.stack[historyRef.current.idx].raw)
  }, [])

  const redo = useCallback(() => {
    const { idx, stack } = historyRef.current
    if (idx >= stack.length - 1) return
    historyRef.current.idx += 1
    _setValue(historyRef.current.stack[historyRef.current.idx].raw)
  }, [])

  const state: DataSheetControllerState = useMemo(() => {
    const currentSnap = sanitize(value)
    const isDirty = !compare(currentSnap, initialSnapRef.current)
    const { idx, stack } = historyRef.current
    return {
      isDirty,
      canUndo: idx > 0,
      canRedo: idx < stack.length - 1,
      historyLength: stack.length,
      index: idx,
    }
  }, [compare, sanitize, value])

  const onChange = useCallback((next: T[]) => setValue(next), [setValue])

  return {
    value,
    onChange,
    setValue,
    getValue,
    reset,
    setInitial,
    undo,
    redo,
    state,
  }
}
