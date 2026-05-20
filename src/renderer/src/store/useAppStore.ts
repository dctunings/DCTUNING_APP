import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  currentPage: string
  currentECUFile: string | null
  currentECUIdent: string | null
  sidebarOpen: boolean
  aiEnabled: boolean
  setCurrentPage: (page: string) => void
  setCurrentECUFile: (file: string | null) => void
  setCurrentECUIdent: (ident: string | null) => void
  toggleSidebar: () => void
  setAIEnabled: (enabled: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: 'Dashboard',
      currentECUFile: null,
      currentECUIdent: null,
      sidebarOpen: true,
      aiEnabled: true,
      setCurrentPage: (page) => set({ currentPage: page }),
      setCurrentECUFile: (file) => set({ currentECUFile: file }),
      setCurrentECUIdent: (ident) => set({ currentECUIdent: ident }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setAIEnabled: (enabled) => set({ aiEnabled: enabled }),
    }),
    {
      name: 'dctuning-app-store',
      version: 1,
    }
  )
)
