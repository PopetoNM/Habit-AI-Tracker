import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../queries/keys";
import type {
  AppSettings,
  BackupMetadata,
  Habit,
  ModelStatus,
  ProfileSummary,
} from "../../../shared/types";

type HabitDraft = {
  name: string;
  emoji: string;
  category: string;
  minimumValue: string;
  unit: string;
};

const emptyHabitDraft: HabitDraft = {
  name: "",
  emoji: "",
  category: "",
  minimumValue: "",
  unit: "",
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [profileDraft, setProfileDraft] = useState("");
  const [habitDraft, setHabitDraft] = useState<HabitDraft>(emptyHabitDraft);
  const settingsQuery = useQuery<AppSettings>({
    queryKey: keys.settings(),
    queryFn: window.habitApi.settings.get,
  });
  const profileQuery = useQuery<ProfileSummary>({
    queryKey: keys.profile(),
    queryFn: async () => {
      const profile = await window.habitApi.profile.getSummary();
      setProfileDraft(profile.rawContent);
      return profile;
    },
  });
  const modelQuery = useQuery<ModelStatus[]>({
    queryKey: keys.coachModels(),
    queryFn: window.habitApi.coach.checkModels,
  });
  const backupsQuery = useQuery<BackupMetadata[]>({
    queryKey: keys.backups(),
    queryFn: window.habitApi.backup.list,
  });
  const habitsQuery = useQuery<Habit[]>({
    queryKey: keys.habits(),
    queryFn: window.habitApi.habits.list,
  });

  const invalidateHabits = () => {
    queryClient.invalidateQueries({ queryKey: keys.habits() });
    queryClient.invalidateQueries({ queryKey: ["planner-habits"] });
    queryClient.invalidateQueries({ queryKey: ["month"] });
    queryClient.invalidateQueries({ queryKey: ["today"] });
  };

  const updateSettings = useMutation({
    mutationFn: window.habitApi.settings.update,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.settings() }),
  });
  const updateProfile = useMutation({
    mutationFn: window.habitApi.profile.updateSummary,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.profile() }),
  });
  const importProfile = useMutation({
    mutationFn: window.habitApi.profile.importMarkdown,
    onSuccess: (profile) => {
      setProfileDraft(profile.rawContent);
      queryClient.invalidateQueries({ queryKey: keys.profile() });
    },
  });
  const createHabit = useMutation({
    mutationFn: window.habitApi.habits.create,
    onSuccess: () => {
      setHabitDraft(emptyHabitDraft);
      invalidateHabits();
    },
  });
  const updateHabit = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof window.habitApi.habits.update>[1];
    }) => window.habitApi.habits.update(id, input),
    onSuccess: invalidateHabits,
  });
  const backupMutation = useMutation({
    mutationFn: () => window.habitApi.backup.create({ kind: "manual" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.backups() }),
  });
  const restoreMutation = useMutation({
    mutationFn: window.habitApi.backup.restore,
  });
  const setModelMutation = useMutation({
    mutationFn: window.habitApi.coach.setModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.coachModels() });
      queryClient.invalidateQueries({ queryKey: keys.coachHealth() });
    },
  });

  const settings = settingsQuery.data;

  const addHabit = () => {
    const name = habitDraft.name.trim();
    if (!name) return;
    createHabit.mutate({
      name,
      emoji: habitDraft.emoji.trim() || null,
      category: habitDraft.category.trim() || null,
      targetType: "boolean",
      targetValue: null,
      minimumValue: habitDraft.minimumValue
        ? Number(habitDraft.minimumValue)
        : null,
      unit: habitDraft.unit.trim() || null,
    });
  };

  return (
    <div className="settings-page">
      <section className="panel settings-hero">
        <p className="eyebrow">Local configuration</p>
        <h1>Settings, profile, backups</h1>
      </section>

      <section className="settings-grid">
        <div className="panel settings-card">
          <div className="panel-head">
            <strong>App settings</strong>
          </div>
          <label>
            Timezone
            <input
              defaultValue={settings?.timezone ?? "Europe/Sofia"}
              onBlur={(event) =>
                updateSettings.mutate({ timezone: event.currentTarget.value })
              }
            />
          </label>
          <label>
            First day of week
            <select
              defaultValue={settings?.firstDayOfWeek ?? 1}
              onChange={(event) =>
                updateSettings.mutate({
                  firstDayOfWeek: Number(event.currentTarget.value),
                })
              }
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </label>
          <label>
            Backup folder
            <input
              defaultValue={settings?.backupFolderPath ?? ""}
              onBlur={(event) =>
                updateSettings.mutate({
                  backupFolderPath: event.currentTarget.value,
                })
              }
            />
          </label>
        </div>

        <div className="panel settings-card">
          <div className="panel-head">
            <strong>AI models</strong>
          </div>
          <div className="model-list">
            {modelQuery.data?.map((model) => (
              <button
                key={`${model.role}-${model.name}`}
                className={`${model.installed ? "model-item installed" : "model-item missing"} ${model.active ? "active" : ""}`}
                disabled={!model.installed}
                onClick={() =>
                  setModelMutation.mutate({ activeModel: model.name })
                }
              >
                <span>
                  {model.active ? `${model.role} · active` : model.role}
                </span>
                <strong>{model.name}</strong>
                <small>
                  {model.installed
                    ? "installed"
                    : `missing: ollama pull ${model.name}`}
                </small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel settings-card wide-card">
          <div className="panel-head">
            <strong>Habits and customization</strong>
          </div>
          <div className="habit-settings-form">
            <input
              value={habitDraft.name}
              onChange={(event) =>
                setHabitDraft((draft) => ({
                  ...draft,
                  name: event.target.value,
                }))
              }
              placeholder="Habit name"
            />
            <input
              value={habitDraft.emoji}
              onChange={(event) =>
                setHabitDraft((draft) => ({
                  ...draft,
                  emoji: event.target.value,
                }))
              }
              placeholder="Emoji"
            />
            <input
              value={habitDraft.category}
              onChange={(event) =>
                setHabitDraft((draft) => ({
                  ...draft,
                  category: event.target.value,
                }))
              }
              placeholder="Category"
            />
            <input
              type="number"
              min={0}
              value={habitDraft.minimumValue}
              onChange={(event) =>
                setHabitDraft((draft) => ({
                  ...draft,
                  minimumValue: event.target.value,
                }))
              }
              placeholder="Minimum"
            />
            <input
              value={habitDraft.unit}
              onChange={(event) =>
                setHabitDraft((draft) => ({
                  ...draft,
                  unit: event.target.value,
                }))
              }
              placeholder="Unit"
            />
            <button onClick={addHabit} disabled={!habitDraft.name.trim()}>
              Add habit
            </button>
          </div>
          <div className="habit-settings-list">
            {habitsQuery.data?.map((habit) => (
              <HabitSettingsRow
                key={habit.id}
                habit={habit}
                onSave={(input) => updateHabit.mutate({ id: habit.id, input })}
                onDisable={() =>
                  updateHabit.mutate({ id: habit.id, input: { active: false } })
                }
              />
            ))}
          </div>
        </div>

        <div className="panel settings-card wide-card">
          <div className="panel-head">
            <strong>profile.md</strong>
            <span className="panel-actions">
              <button onClick={() => importProfile.mutate()}>Import</button>
              <button
                onClick={() =>
                  updateProfile.mutate({ rawContent: profileDraft })
                }
              >
                Save
              </button>
            </span>
          </div>
          <textarea
            className="profile-editor"
            value={profileDraft}
            onChange={(event) => setProfileDraft(event.target.value)}
          />
          <details>
            <summary>Structured summary</summary>
            <pre>{profileQuery.data?.structuredJson}</pre>
          </details>
        </div>

        <div className="panel settings-card">
          <div className="panel-head">
            <strong>Backups</strong>
            <span className="panel-actions">
              <button onClick={() => backupMutation.mutate()}>Create</button>
              <button onClick={() => restoreMutation.mutate()}>Restore</button>
            </span>
          </div>
          <div className="backup-list">
            {backupsQuery.data?.map((backup) => (
              <div key={backup.id} className="backup-item">
                <strong>{backup.kind}</strong>
                <small>{backup.filePath}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function HabitSettingsRow({
  habit,
  onSave,
  onDisable,
}: {
  habit: Habit;
  onSave: (input: Parameters<typeof window.habitApi.habits.update>[1]) => void;
  onDisable: () => void;
}) {
  const [draft, setDraft] = useState<HabitDraft>({
    name: habit.name,
    emoji: habit.emoji ?? "",
    category: habit.category ?? "",
    minimumValue: habit.minimumValue?.toString() ?? "",
    unit: habit.unit ?? "",
  });

  useEffect(() => {
    setDraft({
      name: habit.name,
      emoji: habit.emoji ?? "",
      category: habit.category ?? "",
      minimumValue: habit.minimumValue?.toString() ?? "",
      unit: habit.unit ?? "",
    });
  }, [habit]);

  return (
    <div className="habit-settings-row">
      <input
        value={draft.name}
        onChange={(event) =>
          setDraft((current) => ({ ...current, name: event.target.value }))
        }
        aria-label={`Habit name ${habit.name}`}
      />
      <input
        value={draft.emoji}
        onChange={(event) =>
          setDraft((current) => ({ ...current, emoji: event.target.value }))
        }
        aria-label={`Habit emoji ${habit.name}`}
      />
      <input
        value={draft.category}
        onChange={(event) =>
          setDraft((current) => ({ ...current, category: event.target.value }))
        }
        aria-label={`Habit category ${habit.name}`}
      />
      <input
        type="number"
        min={0}
        value={draft.minimumValue}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            minimumValue: event.target.value,
          }))
        }
        aria-label={`Habit minimum ${habit.name}`}
      />
      <input
        value={draft.unit}
        onChange={(event) =>
          setDraft((current) => ({ ...current, unit: event.target.value }))
        }
        aria-label={`Habit unit ${habit.name}`}
      />
      <button
        onClick={() =>
          onSave({
            name: draft.name.trim(),
            emoji: draft.emoji.trim() || null,
            category: draft.category.trim() || null,
            minimumValue: draft.minimumValue
              ? Number(draft.minimumValue)
              : null,
            unit: draft.unit.trim() || null,
          })
        }
        disabled={!draft.name.trim()}
      >
        Save
      </button>
      <button onClick={onDisable}>Disable</button>
    </div>
  );
}
