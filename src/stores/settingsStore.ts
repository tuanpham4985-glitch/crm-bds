import { create } from 'zustand';

interface SettingsStore {
  logo: string | null;
  setLogo: (logo: string | null) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  logo: null,
  setLogo: (logo) => set({ logo }),
}));
