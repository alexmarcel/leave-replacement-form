import { createContext, useContext, useState } from 'react'

interface ApplyState {
  leaveTypeId: string
  leaveTypeName: string
  requiresReplacement: boolean
  startDate: string
  endDate: string
  totalDays: number
  reason: string
  replacementId: string
  replacementName: string
  approverId: string
  approverName: string
}

const empty: ApplyState = {
  leaveTypeId: '', leaveTypeName: '', requiresReplacement: true,
  startDate: '', endDate: '', totalDays: 0, reason: '',
  replacementId: '', replacementName: '',
  approverId: '', approverName: '',
}

interface ApplyContextType {
  state: ApplyState
  set: (patch: Partial<ApplyState>) => void
  reset: () => void
}

const ApplyContext = createContext<ApplyContextType>({
  state: empty, set: () => {}, reset: () => {},
})

export function ApplyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ApplyState>(empty)
  function set(patch: Partial<ApplyState>) { setState(prev => ({ ...prev, ...patch })) }
  function reset() { setState(empty) }
  return <ApplyContext.Provider value={{ state, set, reset }}>{children}</ApplyContext.Provider>
}

export const useApply = () => useContext(ApplyContext)
