import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { HabitRepository } from "../src/main/db/repository";

const dataDir = resolve("data");
mkdirSync(dataDir, { recursive: true });
const repository = new HabitRepository(resolve(dataDir, "habit-os.sqlite"), resolve(dataDir, "backups"));
console.log(`Seeded ${repository.listHabits().length} habits and ${repository.listProjects().length} projects`);
repository.db.close();
