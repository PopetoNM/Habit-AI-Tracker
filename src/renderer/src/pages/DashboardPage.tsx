import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCheck,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Bars } from "../components/common/Bars";
import { DonutChart } from "../components/common/DonutChart";
import { ProgressBar } from "../components/common/ProgressBar";
import {
  startWavRecorder,
  type CapturedAudio,
  type WavRecorder,
} from "../coach/audioCapture";
import { CoachReactiveOrb } from "../coach/CoachReactiveOrb";
import { prepareAudioForLocalTranscription } from "../coach/localTranscription";
import {
  collectSpeechTranscript,
  getSpeechRecognitionConstructor,
  type SpeechRecognitionLike,
} from "../coach/speech";
import {
  appendAssistantToken,
  ensureAssistantMessage,
  type CoachThreadMessage,
} from "../coach/thread";
import { classifyCoachTopic } from "../coach/visual";
import {
  VOICE_SILENCE_DELAY_MS,
  formatLocalVoiceCaptureStatus,
  formatVoiceCaptureStatus,
  isLocalSilence,
  isLocalSpeechActivity,
} from "../coach/voiceCapture";
import {
  formatTimerSeconds,
  timerProgress,
  type FocusMode,
} from "../focus/timer";
import { keys } from "../queries/keys";
import { useUiStore } from "../state/uiStore";
import {
  formatShortDay,
  monthKey,
  parseDateKey,
  todayKey,
} from "../../../shared/dates";
import type {
  ChatMessage,
  CoachStatusPayload,
  DashboardMonth,
  FocusSession,
  Habit,
  HabitStatus,
  Todo,
} from "../../../shared/types";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const setSelectedMonth = useUiStore((state) => state.setSelectedMonth);
  const selectedDate = useUiStore((state) => state.selectedDate);
  const setSelectedDate = useUiStore((state) => state.setSelectedDate);
  const [todoTitle, setTodoTitle] = useState("");
  const [focusScreen, setFocusScreen] = useState<FocusSession | null>(null);

  const monthQuery = useQuery<DashboardMonth>({
    queryKey: keys.month(selectedMonth),
    queryFn: () => window.habitApi.dashboard.getMonth(selectedMonth),
  });

  const todayQuery = useQuery({
    queryKey: keys.today(selectedDate),
    queryFn: () => window.habitApi.dashboard.getToday(selectedDate),
  });
  const focusQuery = useQuery<FocusSession[]>({
    queryKey: keys.focus(),
    queryFn: window.habitApi.focus.recent,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.month(selectedMonth) });
    queryClient.invalidateQueries({ queryKey: keys.today(selectedDate) });
  };

  const checkinMutation = useMutation({
    mutationFn: window.habitApi.habits.setCheckin,
    onSuccess: invalidate,
  });
  const clearCheckinMutation = useMutation({
    mutationFn: window.habitApi.habits.clearCheckin,
    onSuccess: invalidate,
  });
  const habitMutation = useMutation({
    mutationFn: window.habitApi.habits.create,
    onSuccess: invalidate,
  });
  const updateHabitMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof window.habitApi.habits.update>[1];
    }) => window.habitApi.habits.update(id, input),
    onSuccess: invalidate,
  });
  const reorderHabitMutation = useMutation({
    mutationFn: window.habitApi.habits.reorder,
    onSuccess: invalidate,
  });
  const todoMutation = useMutation({
    mutationFn: window.habitApi.todos.create,
    onSuccess: () => {
      setTodoTitle("");
      invalidate();
    },
  });
  const updateTodoMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Todo["status"] }) =>
      window.habitApi.todos.update(id, { status }),
    onSuccess: invalidate,
  });
  const deleteTodoMutation = useMutation({
    mutationFn: window.habitApi.todos.delete,
    onSuccess: invalidate,
  });
  const startFocusMutation = useMutation({
    mutationFn: window.habitApi.focus.start,
    onSuccess: (session) => {
      setFocusScreen(session);
      queryClient.invalidateQueries({ queryKey: keys.focus() });
    },
  });
  const endFocusMutation = useMutation({
    mutationFn: ({
      id,
      outputProduced,
      nextAction,
      distractionsCount,
    }: {
      id: string;
      outputProduced?: string;
      nextAction?: string;
      distractionsCount?: number;
    }) =>
      window.habitApi.focus.end(id, {
        outputProduced,
        nextAction,
        distractionsCount,
      }),
    onSuccess: () => {
      setFocusScreen(null);
      queryClient.invalidateQueries({ queryKey: keys.focus() });
    },
  });

  const data = monthQuery.data;
  const today = todayQuery.data;
  const checkinMap = useMemo(() => {
    const map = new Map<string, HabitStatus>();
    for (const checkin of data?.checkins ?? [])
      map.set(`${checkin.habitId}:${checkin.date}`, checkin.status);
    return map;
  }, [data?.checkins]);

  if (monthQuery.isLoading || !data)
    return <div className="page-status">Loading dashboard...</div>;

  const dayRates = data.days.map((date) => {
    const dayCheckins = data.checkins.filter(
      (checkin) => checkin.date === date,
    );
    const weighted = dayCheckins.reduce(
      (sum, item) =>
        sum +
        (item.status === "completed" ? 1 : item.status === "minimum" ? 0.5 : 0),
      0,
    );
    return {
      label: String(parseDateKey(date).getDate()),
      value: data.habits.length
        ? Math.round((weighted / data.habits.length) * 100)
        : 0,
    };
  });
  const weekRates = [0, 1, 2, 3, 4].map((week) => {
    const days = data.days.slice(week * 7, week * 7 + 7);
    const values = dayRates.filter((rate) =>
      days.some((day) => String(parseDateKey(day).getDate()) === rate.label),
    );
    const average = values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value.value, 0) / values.length,
        )
      : 0;
    return { label: `W${week + 1}`, value: average };
  });

  const cycleCheckin = (habit: Habit, date: string) => {
    const current = checkinMap.get(`${habit.id}:${date}`);
    if (current === "completed")
      clearCheckinMutation.mutate({ habitId: habit.id, date });
    else
      checkinMutation.mutate({ habitId: habit.id, date, status: "completed" });
  };

  const checkAllForSelectedDay = () => {
    for (const habit of data.habits) {
      if (checkinMap.get(`${habit.id}:${selectedDate}`) !== "completed") {
        checkinMutation.mutate({
          habitId: habit.id,
          date: selectedDate,
          status: "completed",
        });
      }
    }
  };

  const moveHabit = (habitId: string, direction: -1 | 1) => {
    const ids = data.habits.map((habit) => habit.id);
    const index = ids.indexOf(habitId);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderHabitMutation.mutate(ids);
  };

  const addHabit = () => {
    const name = window.prompt("Habit name");
    if (!name) return;
    habitMutation.mutate({
      name,
      emoji: "□",
      category: "custom",
      targetType: "boolean",
      targetValue: 1,
      minimumValue: 0.5,
      unit: "check",
    });
  };

  return (
    <div className="dashboard-page">
      <section className="dashboard-grid">
        <div className="panel title-panel">
          <div>
            <p className="eyebrow">Private local dashboard</p>
            <h1>HABIT TRACKER</h1>
          </div>
          <label>
            Month
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value || monthKey())
              }
            />
          </label>
        </div>

        <div className="panel stat-panel">
          <DonutChart
            value={data.analytics.overallCompletionPercentage}
            label="overall"
          />
          <div className="stat-list">
            <span>Goals: {data.analytics.totalHabitGoalCount}</span>
            <span>Done: {data.analytics.completedCount}</span>
            <span>Minimum: {data.analytics.minimumCount}</span>
            <span>Left: {Math.round(data.analytics.leftCount)}</span>
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <strong>Daily progress</strong>
          </div>
          <Bars values={dayRates} />
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <strong>Weekly progress</strong>
          </div>
          <Bars values={weekRates} />
        </div>

        <div className="panel habit-matrix-panel">
          <div className="panel-head">
            <strong>My habits</strong>
            <span className="panel-actions">
              <button
                className="icon-text"
                onClick={checkAllForSelectedDay}
                data-testid="check-all-current-day"
              >
                <CheckCheck size={16} /> Check all
              </button>
              <button className="icon-text" onClick={addHabit}>
                <Plus size={16} /> Add
              </button>
            </span>
          </div>
          <div className="habit-matrix">
            <div className="habit-header sticky-col">Habit</div>
            {data.days.map((day) => (
              <button
                key={day}
                className={
                  day === selectedDate ? "day-header selected" : "day-header"
                }
                onClick={() => setSelectedDate(day)}
                title={formatShortDay(day)}
              >
                {parseDateKey(day).getDate()}
              </button>
            ))}
            {data.habits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                days={data.days}
                selectedDate={selectedDate}
                checkinMap={checkinMap}
                onCellClick={cycleCheckin}
                onRename={(name) =>
                  updateHabitMutation.mutate({ id: habit.id, input: { name } })
                }
                onHide={() =>
                  updateHabitMutation.mutate({
                    id: habit.id,
                    input: { active: false },
                  })
                }
                onMove={(direction) => moveHabit(habit.id, direction)}
              />
            ))}
          </div>
        </div>

        <div className="panel analysis-panel">
          <div className="panel-head">
            <strong>Analysis</strong>
          </div>
          <div className="analysis-table">
            {data.analytics.perHabit.map((row) => (
              <div className="analysis-row" key={row.habitId}>
                <span>
                  {row.emoji} {row.habitName}
                </span>
                <ProgressBar value={row.percentage} />
                <b>{row.percentage}%</b>
              </div>
            ))}
          </div>
        </div>

        <div className="panel top-panel">
          <div className="panel-head">
            <strong>Top 10 daily habits</strong>
          </div>
          <ol className="top-list">
            {data.analytics.topHabits.map((habit) => (
              <li key={habit}>{habit}</li>
            ))}
          </ol>
        </div>
      </section>

      <aside className="right-rail">
        <TodayTodos
          date={selectedDate}
          todos={today?.todos ?? []}
          value={todoTitle}
          onChange={setTodoTitle}
          onAdd={() =>
            todoTitle.trim() &&
            todoMutation.mutate({
              date: selectedDate,
              title: todoTitle.trim(),
              priority: "medium",
            })
          }
          onToggle={(todo) =>
            updateTodoMutation.mutate({
              id: todo.id,
              status: todo.status === "done" ? "open" : "done",
            })
          }
          onDelete={(todo) => deleteTodoMutation.mutate(todo.id)}
        />
        <FocusBlockPanel
          sessions={focusQuery.data ?? []}
          onStart={(title) =>
            startFocusMutation.mutate({ title, plannedMinutes: 25 })
          }
          onOpen={(session) => setFocusScreen(session)}
          onEnd={(session) => {
            const outputProduced =
              window.prompt(
                "What did you ship?",
                session.outputProduced ?? "",
              ) ?? "";
            const nextAction =
              window.prompt("Next action?", session.nextAction ?? "") ?? "";
            const distractionsCount = Number(
              window.prompt(
                "Distractions count?",
                String(session.distractionsCount),
              ) ?? session.distractionsCount,
            );
            endFocusMutation.mutate({
              id: session.id,
              outputProduced,
              nextAction,
              distractionsCount,
            });
          }}
        />
        <AiCoachPanel />
      </aside>
      {focusScreen && (
        <FocusTimerScreen
          session={focusScreen}
          onClose={() => setFocusScreen(null)}
          onComplete={(input) =>
            endFocusMutation.mutate({ id: focusScreen.id, ...input })
          }
        />
      )}
    </div>
  );
}

function HabitRow({
  habit,
  days,
  selectedDate,
  checkinMap,
  onCellClick,
  onRename,
  onHide,
  onMove,
}: {
  habit: Habit;
  days: string[];
  selectedDate: string;
  checkinMap: Map<string, HabitStatus>;
  onCellClick: (habit: Habit, date: string) => void;
  onRename: (name: string) => void;
  onHide: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <>
      <button
        className="habit-name sticky-col"
        onDoubleClick={() => {
          const name = window.prompt("Rename habit", habit.name);
          if (name) onRename(name);
        }}
      >
        <span>{habit.emoji}</span>
        <span className="habit-label">{habit.name}</span>
        <span
          className="habit-row-actions"
          aria-label={`${habit.name} row actions`}
        >
          <span
            onClick={(event) => {
              event.stopPropagation();
              onMove(-1);
            }}
          >
            ↑
          </span>
          <span
            onClick={(event) => {
              event.stopPropagation();
              onMove(1);
            }}
          >
            ↓
          </span>
          <span
            onClick={(event) => {
              event.stopPropagation();
              onHide();
            }}
          >
            hide
          </span>
        </span>
      </button>
      {days.map((day) => {
        const status = checkinMap.get(`${habit.id}:${day}`);
        const displayStatus = status === "completed" ? "completed" : "empty";
        return (
          <button
            key={day}
            className={`check-cell ${displayStatus} ${day === selectedDate ? "selected" : ""}`}
            onClick={() => onCellClick(habit, day)}
            aria-label={`${habit.name} ${day} ${status ?? "empty"}`}
          >
            {status === "completed" ? "✓" : ""}
          </button>
        );
      })}
    </>
  );
}

function TodayTodos({
  date,
  todos,
  value,
  onChange,
  onAdd,
  onToggle,
  onDelete,
}: {
  date: string;
  todos: Todo[];
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  return (
    <section className="panel todo-panel">
      <div className="panel-head">
        <strong>Today's To-Dos</strong>
        <small>{date}</small>
      </div>
      <div className="todo-list">
        {todos.map((todo) => (
          <div key={todo.id} className="todo-row">
            <button
              className={
                todo.status === "done" ? "todo-item done" : "todo-item"
              }
              onClick={() => onToggle(todo)}
            >
              <span>{todo.status === "done" ? "✓" : ""}</span>
              {todo.title}
            </button>
            <button
              className="icon-button"
              onClick={() => onDelete(todo)}
              aria-label={`Delete ${todo.title}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Add task"
          onKeyDown={(event) => event.key === "Enter" && onAdd()}
        />
        <button onClick={onAdd}>Add</button>
      </div>
    </section>
  );
}

function FocusBlockPanel({
  sessions,
  onStart,
  onOpen,
  onEnd,
}: {
  sessions: FocusSession[];
  onStart: (title: string) => void;
  onOpen: (session: FocusSession) => void;
  onEnd: (session: FocusSession) => void;
}) {
  const active = sessions.find((session) => !session.endedAt);
  const [title, setTitle] = useState("25 min build / ship");
  return (
    <section className="panel focus-panel">
      <div className="panel-head">
        <strong>Focus Block</strong>
        <button
          onClick={() => {
            if (active) onOpen(active);
            else {
              const trimmed = title.trim();
              onStart(trimmed || "Focus block");
            }
          }}
        >
          {active ? "Open" : "Start"}
        </button>
        {active && <button onClick={() => onEnd(active)}>End</button>}
      </div>
      {active ? (
        <p className="focus-active">Running: {active.title}</p>
      ) : (
        <>
          <input
            className="focus-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <p className="focus-empty">
            Start a bounded block. Track output, distractions, and next action.
          </p>
        </>
      )}
      <div className="mini-session-list">
        {sessions.slice(0, 3).map((session) => (
          <span key={session.id}>
            {session.title}{" "}
            {session.actualMinutes ? `(${session.actualMinutes}m)` : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function FocusTimerScreen({
  session,
  onClose,
  onComplete,
}: {
  session: FocusSession;
  onClose: () => void;
  onComplete: (input: {
    outputProduced?: string;
    nextAction?: string;
    distractionsCount?: number;
  }) => void;
}) {
  const [mode, setMode] = useState<FocusMode>("timer");
  const [durationMinutes, setDurationMinutes] = useState(
    session.plannedMinutes ?? 25,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [outputProduced, setOutputProduced] = useState(
    session.outputProduced ?? "",
  );
  const [nextAction, setNextAction] = useState(session.nextAction ?? "");
  const [distractionsCount, setDistractionsCount] = useState(
    session.distractionsCount,
  );
  const durationSeconds = Math.max(60, durationMinutes * 60);
  const displaySeconds =
    mode === "timer"
      ? Math.max(0, durationSeconds - elapsedSeconds)
      : elapsedSeconds;
  const progress = timerProgress(mode, elapsedSeconds, durationSeconds);
  const circumference = 2 * Math.PI * 96;

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => {
        if (mode === "timer" && current + 1 >= durationSeconds) {
          setRunning(false);
          return durationSeconds;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [durationSeconds, mode, running]);

  return (
    <section className="focus-screen" role="dialog" aria-label="Focus timer">
      <div className="focus-bg" />
      <button
        className="focus-close"
        onClick={onClose}
        aria-label="Close focus screen"
      >
        Close
      </button>
      <div className="focus-stage">
        <p className="eyebrow">Deep focus</p>
        <h2>{session.title}</h2>
        <div className="focus-ring">
          <svg viewBox="0 0 240 240" aria-hidden="true">
            <circle className="focus-ring-outer" cx="120" cy="120" r="108" />
            <circle className="focus-ring-track" cx="120" cy="120" r="96" />
            <circle
              className="focus-ring-progress"
              cx="120"
              cy="120"
              r="96"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <div className="focus-time">
            <small>{mode}</small>
            <strong>{formatTimerSeconds(displaySeconds)}</strong>
          </div>
        </div>
        <div className="focus-controls">
          <button
            onClick={() => setMode(mode === "timer" ? "stopwatch" : "timer")}
          >
            {mode === "timer" ? "Stopwatch" : "Timer"}
          </button>
          <button
            onClick={() =>
              setDurationMinutes((minutes) => Math.max(5, minutes - 5))
            }
          >
            -5
          </button>
          <button onClick={() => setRunning((current) => !current)}>
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={() =>
              setDurationMinutes((minutes) => Math.min(180, minutes + 5))
            }
          >
            +5
          </button>
          <button
            onClick={() => {
              setElapsedSeconds(0);
              setRunning(false);
            }}
          >
            Reset
          </button>
        </div>
        <div className="focus-complete-panel">
          <input
            value={outputProduced}
            onChange={(event) => setOutputProduced(event.target.value)}
            placeholder="Output produced"
          />
          <input
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            placeholder="Next action"
          />
          <label>
            Distractions
            <input
              type="number"
              min={0}
              value={distractionsCount}
              onChange={(event) =>
                setDistractionsCount(Number(event.target.value))
              }
            />
          </label>
          <button
            className="focus-complete"
            onClick={() =>
              onComplete({ outputProduced, nextAction, distractionsCount })
            }
          >
            Complete focus block
          </button>
        </div>
      </div>
    </section>
  );
}

function AiCoachPanel() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const activeSessionRef = useRef<string | undefined>(undefined);
  const busyRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const transcriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const voiceCaptureModeRef = useRef<"idle" | "browser" | "local">("idle");
  const voiceFinishingRef = useRef(false);
  const manualVoiceStopRef = useRef(false);
  const browserSpeechErrorRef = useRef(false);
  const browserSilenceStopRef = useRef(false);
  const localSpeechDetectedRef = useRef(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CoachThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visualMode, setVisualMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const healthQuery = useQuery({
    queryKey: keys.coachHealth(),
    queryFn: window.habitApi.coach.health,
  });
  const hasSpeechRecognition = Boolean(getSpeechRecognitionConstructor(window));
  const coachTopic = useMemo(
    () =>
      classifyCoachTopic(
        input.trim() ||
          messages
            .slice(-4)
            .map((message) => message.content)
            .join(" "),
      ),
    [input, messages],
  );

  useEffect(() => {
    let cancelled = false;
    window.habitApi.coach.getHistory().then((history) => {
      if (cancelled) return;
      activeSessionRef.current = history.session.id;
      setSessionId(history.session.id);
      setMessages(history.messages.map(chatMessageToThreadMessage));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    return window.habitApi.coach.onToken((payload) => {
      if (
        activeSessionRef.current &&
        payload.sessionId !== activeSessionRef.current
      )
        return;
      activeSessionRef.current = payload.sessionId;
      setSessionId(payload.sessionId);
      if (!payload.token) return;
      setThinking(false);
      setBusy(true);
      setStatusText("Streaming response...");
      setMessages((current) =>
        appendAssistantToken(
          current,
          payload.turnId ?? payload.sessionId,
          payload.token,
        ),
      );
    });
  }, []);

  useEffect(() => {
    return window.habitApi.coach.onStatus((payload) => {
      if (
        activeSessionRef.current &&
        payload.sessionId !== activeSessionRef.current
      )
        return;
      activeSessionRef.current = payload.sessionId;
      setSessionId(payload.sessionId);
      setStatusText(formatCoachStatus(payload));
      if (
        [
          "received",
          "preparing_context",
          "selecting_model",
          "contacting_model",
        ].includes(payload.status)
      ) {
        setThinking(true);
        setBusy(true);
      }
      if (payload.status === "streaming") {
        setThinking(false);
        setBusy(true);
      }
      if (payload.status === "done" || payload.status === "error") {
        setThinking(false);
        setBusy(false);
      }
    });
  }, []);

  useEffect(() => {
    return window.habitApi.coach.onDone((payload) => {
      const done = payload as {
        sessionId?: string;
        turnId?: string;
        message?: { content?: string };
      };
      if (!done.sessionId) return;
      if (
        activeSessionRef.current &&
        done.sessionId !== activeSessionRef.current
      )
        return;
      activeSessionRef.current = done.sessionId;
      setSessionId(done.sessionId);
      setThinking(false);
      setBusy(false);
      setStatusText("Response complete.");
      const queryFamiliesToRefresh = new Set([
        "month",
        "today",
        "week",
        "habits",
        "planner-habits",
        "focus",
        "distraction",
        "profile",
        "settings",
      ]);
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryFamiliesToRefresh.has(String(query.queryKey[0])),
      });
      if (done.message?.content) {
        setMessages((current) =>
          ensureAssistantMessage(
            current,
            done.turnId ?? done.sessionId!,
            done.message!.content!,
          ),
        );
        if (voiceOutput) speakCoach(done.message.content);
      }
    });
  }, [queryClient, voiceOutput]);

  useEffect(() => {
    return window.habitApi.coach.onError((payload) => {
      if (
        activeSessionRef.current &&
        payload.sessionId !== activeSessionRef.current
      )
        return;
      activeSessionRef.current = payload.sessionId;
      setSessionId(payload.sessionId);
      setThinking(false);
      setBusy(false);
      setStatusText("Coach error.");
      setError(payload.message);
    });
  }, []);

  useEffect(() => {
    return () => {
      clearVoiceSilenceTimer();
      recognitionRef.current?.stop();
      void stopVoiceRecorder(false);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const sendText = async (message: string, quickAction?: string) => {
    if (!message) return;
    activeSessionRef.current = sessionId;
    setMessages((current) => [
      ...current,
      { id: createCoachMessageId("user"), role: "user", content: message },
    ]);
    setThinking(true);
    setBusy(true);
    setStatusText("Sending to local coach...");
    setError(null);
    try {
      const result = await window.habitApi.coach.sendMessage({
        sessionId,
        message,
        quickAction,
      });
      activeSessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      setInput("");
    } catch (caught) {
      setThinking(false);
      setBusy(false);
      setStatusText("Coach error.");
      setError(
        caught instanceof Error
          ? caught.message
          : "AI coach failed. Check Ollama and the selected local model.",
      );
    }
  };

  const send = async (quickAction?: string) => {
    const message = quickAction ?? input.trim();
    await sendText(message, quickAction);
  };

  const cancel = () => {
    window.habitApi.coach.cancel(sessionId);
    setThinking(false);
    setBusy(false);
    setStatusText("Cancelled.");
  };

  const startNewChat = async () => {
    const session = await window.habitApi.coach.startSession();
    activeSessionRef.current = session.id;
    setSessionId(session.id);
    setMessages([]);
    setError(null);
    setThinking(false);
    setBusy(false);
    setStatusText("New chat ready.");
  };

  async function stopVoiceRecorder(
    keepAudio: boolean,
  ): Promise<CapturedAudio | null> {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setMicLevel(0);
    if (!recorder) return null;
    const audio = await recorder.stop();
    return keepAudio ? audio : null;
  }

  function resetVoiceCaptureRefs() {
    clearVoiceSilenceTimer();
    voiceCaptureModeRef.current = "idle";
    manualVoiceStopRef.current = false;
    browserSpeechErrorRef.current = false;
    browserSilenceStopRef.current = false;
    localSpeechDetectedRef.current = false;
  }

  function clearVoiceSilenceTimer() {
    if (!silenceTimerRef.current) return;
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }

  function scheduleBrowserSilenceFinish() {
    clearVoiceSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      browserSilenceStopRef.current = true;
      setVoiceStatus("Silence detected. Sending...");
      const recognition = recognitionRef.current;
      if (!recognition) {
        void finishBrowserVoiceCapture(browserSpeechErrorRef.current);
        return;
      }
      try {
        recognition.stop();
      } catch {
        void finishBrowserVoiceCapture(browserSpeechErrorRef.current);
      }
    }, VOICE_SILENCE_DELAY_MS);
  }

  function scheduleLocalSilenceFinish() {
    if (silenceTimerRef.current || !localSpeechDetectedRef.current) return;
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      setVoiceStatus("Silence detected. Transcribing...");
      void finishLocalVoiceCapture();
    }, VOICE_SILENCE_DELAY_MS);
  }

  function handleRecorderLevel(level: number) {
    setMicLevel(level);
    if (
      voiceCaptureModeRef.current !== "local" ||
      voiceFinishingRef.current ||
      transcribing
    )
      return;
    if (isLocalSpeechActivity(level)) {
      localSpeechDetectedRef.current = true;
      clearVoiceSilenceTimer();
      setVoiceStatus(formatLocalVoiceCaptureStatus(true));
      return;
    }
    if (isLocalSilence(level)) scheduleLocalSilenceFinish();
  }

  async function startVoiceRecorder(): Promise<boolean> {
    await stopVoiceRecorder(false);
    try {
      recorderRef.current = await startWavRecorder(handleRecorderLevel);
      return true;
    } catch (caught) {
      setVoiceStatus(
        caught instanceof Error
          ? caught.message
          : "Microphone permission failed.",
      );
      return false;
    }
  }

  const toggleVoiceCapture = async () => {
    if (transcribing) return;
    if (listening) {
      manualVoiceStopRef.current = true;
      clearVoiceSilenceTimer();
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          await finishBrowserVoiceCapture(browserSpeechErrorRef.current);
        }
      } else {
        await finishLocalVoiceCapture();
      }
      return;
    }

    resetVoiceCaptureRefs();
    voiceFinishingRef.current = false;
    transcriptRef.current = "";
    setInput("");
    setError(null);
    setListening(true);
    setVoiceStatus(formatVoiceCaptureStatus(""));
    textareaRef.current?.focus();
    const recorderStarted = await startVoiceRecorder();

    const Recognition = getSpeechRecognitionConstructor(window);
    if (!Recognition) {
      if (!recorderStarted) {
        setListening(false);
        return;
      }
      voiceCaptureModeRef.current = "local";
      setVoiceStatus(formatLocalVoiceCaptureStatus(false));
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const transcript = collectSpeechTranscript(event);
      transcriptRef.current = transcript;
      setInput(transcript);
      setVoiceStatus(formatVoiceCaptureStatus(transcript));
      if (transcript) scheduleBrowserSilenceFinish();
    };
    recognition.onerror = () => {
      browserSpeechErrorRef.current = true;
      clearVoiceSilenceTimer();
      setVoiceStatus("Browser speech failed. Trying local Whisper...");
      try {
        recognition.stop();
      } catch {
        void finishBrowserVoiceCapture(true);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (
        manualVoiceStopRef.current ||
        browserSpeechErrorRef.current ||
        browserSilenceStopRef.current
      ) {
        void finishBrowserVoiceCapture(browserSpeechErrorRef.current);
        return;
      }
      if (voiceCaptureModeRef.current !== "browser") return;
      try {
        recognition.start();
        setVoiceStatus(formatVoiceCaptureStatus(transcriptRef.current));
      } catch {
        browserSilenceStopRef.current = true;
        void finishBrowserVoiceCapture(false);
      }
    };
    voiceCaptureModeRef.current = "browser";
    recognitionRef.current = recognition;
    recognition.start();
  };

  async function finishBrowserVoiceCapture(useLocalFallback: boolean) {
    if (
      voiceFinishingRef.current ||
      (voiceCaptureModeRef.current === "idle" && !recorderRef.current)
    )
      return;
    voiceFinishingRef.current = true;
    clearVoiceSilenceTimer();
    recognitionRef.current = null;
    voiceCaptureModeRef.current = "idle";
    setListening(false);
    try {
      const transcript = transcriptRef.current.trim();
      const audio = await stopVoiceRecorder(useLocalFallback || !transcript);
      if (transcript && !useLocalFallback) {
        setVoiceOutput(true);
        setVoiceStatus("Voice command captured.");
        if (!busyRef.current) void sendText(transcript);
        return;
      }
      if (!audio) {
        setVoiceStatus("No speech detected.");
        return;
      }
      await transcribeAndSend(audio);
    } finally {
      voiceFinishingRef.current = false;
      resetVoiceCaptureRefs();
    }
  }

  async function finishLocalVoiceCapture() {
    if (voiceFinishingRef.current) return;
    voiceFinishingRef.current = true;
    clearVoiceSilenceTimer();
    voiceCaptureModeRef.current = "idle";
    setListening(false);
    try {
      const audio = await stopVoiceRecorder(true);
      if (!audio) {
        setVoiceStatus("No recording captured.");
        return;
      }
      await transcribeAndSend(audio);
    } finally {
      voiceFinishingRef.current = false;
      resetVoiceCaptureRefs();
    }
  }

  async function transcribeAndSend(audio: CapturedAudio) {
    setTranscribing(true);
    setVoiceOutput(true);
    setVoiceStatus("Preparing local voice transcription...");
    try {
      const input = prepareAudioForLocalTranscription(audio);
      setVoiceStatus(
        "Transcribing locally. First run may download the voice model...",
      );
      const transcript =
        await window.habitApi.coach.transcribeLocalAudio(input);
      transcriptRef.current = transcript;
      setInput(transcript);
      setVoiceStatus(
        transcript ? `Heard: ${transcript}` : "No speech detected.",
      );
      if (transcript.trim() && !busyRef.current) await sendText(transcript);
    } catch (caught) {
      setVoiceStatus(
        caught instanceof Error
          ? caught.message
          : "Local voice transcription failed.",
      );
    } finally {
      setTranscribing(false);
    }
  }

  const healthLabel = healthQuery.isLoading
    ? "checking"
    : healthQuery.data?.available
      ? "local"
      : "offline";
  const visualActive = listening || thinking || busy || input.trim().length > 0;

  return (
    <section
      className={
        visualMode ? "panel coach-panel visual-mode" : "panel coach-panel"
      }
    >
      <div className="panel-head">
        <strong>
          <Bot size={16} /> AI Coach
        </strong>
        <span className="coach-head-actions">
          <small>
            {busy || statusText ? (statusText ?? "Working...") : healthLabel}
          </small>
          <button
            className={
              visualMode ? "coach-visual-toggle active" : "coach-visual-toggle"
            }
            onClick={() => setVisualMode((current) => !current)}
            aria-pressed={visualMode}
          >
            <Sparkles size={14} />
            <span>{visualMode ? "Visual on" : "Visual"}</span>
          </button>
          <button onClick={startNewChat} disabled={busy}>
            New
          </button>
        </span>
      </div>
      {!healthQuery.data?.available && (
        <p className="coach-warning">
          {healthQuery.data?.message ?? "Checking Ollama..."}
        </p>
      )}
      {healthQuery.data?.available && (
        <p className="coach-note">{healthQuery.data.message}</p>
      )}
      {visualMode && (
        <CoachReactiveOrb
          topic={coachTopic}
          active={visualActive}
          listening={listening}
          speaking={busy && !thinking}
          audioLevel={micLevel}
        />
      )}
      <div className="quick-actions">
        {[
          "Review today",
          "Plan tomorrow",
          "Check schedule",
          "Prepare schedule",
          "Fill planner",
          "Fix focus",
          "Reduce burnout",
        ].map((action) => (
          <button key={action} onClick={() => send(action)} disabled={busy}>
            {action}
          </button>
        ))}
      </div>
      <div
        className="coach-output coach-thread"
        aria-live="polite"
        data-testid="coach-thread"
      >
        {messages.length === 0 && !thinking && !error && (
          <span className="coach-empty">Ask for a short grounded review.</span>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`coach-message ${message.role}`}>
            {message.content}
          </div>
        ))}
        {thinking && (
          <div
            className="coach-message assistant thinking"
            data-testid="coach-thinking"
          >
            <span className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{statusText ?? "Thinking..."}</span>
          </div>
        )}
        {error && (
          <div className="coach-message assistant error-text">{error}</div>
        )}
      </div>
      {voiceStatus && <p className="coach-note voice-status">{voiceStatus}</p>}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") send();
        }}
        placeholder="Ask the coach or use the mic..."
      />
      <div className="coach-input-actions">
        <button
          className={listening ? "icon-button active" : "icon-button"}
          onClick={toggleVoiceCapture}
          disabled={transcribing}
          aria-label={
            transcribing
              ? "Transcribing voice input"
              : listening
                ? "Stop voice input"
                : "Start voice input"
          }
          title={
            hasSpeechRecognition
              ? "Start voice input"
              : "Record and transcribe locally with Whisper"
          }
        >
          {listening ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button
          className={voiceOutput ? "icon-button active" : "icon-button"}
          onClick={() => setVoiceOutput((current) => !current)}
          aria-label={
            voiceOutput ? "Disable voice output" : "Enable voice output"
          }
          title="Speak coach replies"
        >
          {voiceOutput ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <button onClick={() => send()} disabled={busy}>
          Send
        </button>
        <button onClick={cancel} disabled={!busy}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function formatCoachStatus(payload: CoachStatusPayload): string {
  if (payload.message) return payload.message;
  const labels: Record<CoachStatusPayload["status"], string> = {
    received: "Message received.",
    preparing_context: "Preparing habit context.",
    selecting_model: "Checking local model.",
    contacting_model: "Contacting local model.",
    streaming: "Streaming response...",
    done: "Response complete.",
    error: "Coach error.",
  };
  return labels[payload.status];
}

function chatMessageToThreadMessage(message: ChatMessage): CoachThreadMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  };
}

function createCoachMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function speakCoach(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 0.86;
  utterance.volume = 0.92;
  window.speechSynthesis.speak(utterance);
}
