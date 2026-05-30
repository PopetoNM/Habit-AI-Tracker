import { create } from "zustand";
import { monthKey, startOfWeek, todayKey } from "../../../shared/dates";

type Page = "dashboard" | "planner" | "settings";

type UiState = {
  page: Page;
  selectedMonth: string;
  selectedDate: string;
  selectedWeek: string;
  navCollapsed: boolean;
  plannerDensity: "compact" | "comfortable";
  setPage: (page: Page) => void;
  toggleNavCollapsed: () => void;
  setSelectedMonth: (month: string) => void;
  setSelectedDate: (date: string) => void;
  setSelectedWeek: (week: string) => void;
  setPlannerDensity: (density: "compact" | "comfortable") => void;
};

export const useUiStore = create<UiState>((set) => ({
  page: "dashboard",
  selectedMonth: monthKey(),
  selectedDate: todayKey(),
  selectedWeek: startOfWeek(todayKey()),
  navCollapsed: false,
  plannerDensity: "compact",
  setPage: (page) => set({ page }),
  toggleNavCollapsed: () =>
    set((state) => ({ navCollapsed: !state.navCollapsed })),
  setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedWeek: (selectedWeek) => set({ selectedWeek }),
  setPlannerDensity: (plannerDensity) => set({ plannerDensity }),
}));
