import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { HabitRepository } from "../src/main/db/repository";

const dataDir = resolve("data");
mkdirSync(dataDir, { recursive: true });
const repository = new HabitRepository(resolve(dataDir, "habit-os.sqlite"), resolve(dataDir, "backups"));
repository.db.close();
console.log("Migrated data/habit-os.sqlite");
