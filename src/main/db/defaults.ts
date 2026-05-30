import type { CreateHabitInput, Project } from "../../shared/types";

export const STARTER_PROFILE = `# Profile

# Getting started

Add your own profile, priorities, schedule constraints, habits, projects, and coach preferences in Settings.

# Coach style

I want the coach to be direct, practical, honest, and focused on systems.
`;

export const DEFAULT_PROJECTS: Array<
  Omit<Project, "id" | "createdAt" | "updatedAt">
> = [];

export const DEFAULT_HABITS: CreateHabitInput[] = [];
