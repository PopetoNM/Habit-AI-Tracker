import type { HabitApi } from "../../../preload";

declare global {
  interface Window {
    habitApi: HabitApi;
  }
}

export {};
