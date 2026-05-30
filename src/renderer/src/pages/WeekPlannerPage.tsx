import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Lock, Plus, Trash2, Unlock } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  buildTimeSlots,
  formatShortDay,
  minutesFromTime,
  startOfWeek,
  timeFromMinutes,
  todayKey,
} from "../../../shared/dates";
import type {
  Habit,
  TimeBlock,
  Todo,
  WeekPlannerData,
} from "../../../shared/types";
import {
  generateCoachFillProposals,
  type PlannerProposal,
} from "../planner/coachFill";
import { blockSlotSpan, visiblePlannerSlotLabel } from "../planner/layout";
import { keys } from "../queries/keys";
import { useUiStore } from "../state/uiStore";

export function WeekPlannerPage() {
  const queryClient = useQueryClient();
  const selectedWeek = useUiStore((state) => state.selectedWeek);
  const setSelectedWeek = useUiStore((state) => state.setSelectedWeek);
  const plannerDensity = useUiStore((state) => state.plannerDensity);
  const setPlannerDensity = useUiStore((state) => state.setPlannerDensity);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTiles, setDraftTiles] = useState<
    Array<{
      id: string;
      title: string;
      category: string;
      durationMinutes: number;
    }>
  >([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<PlannerProposal[]>([]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
  );
  const weekQuery = useQuery<WeekPlannerData>({
    queryKey: keys.week(selectedWeek),
    queryFn: () => window.habitApi.planner.getWeek(selectedWeek),
  });
  const habitsQuery = useQuery<Habit[]>({
    queryKey: ["planner-habits"],
    queryFn: window.habitApi.habits.list,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: keys.week(selectedWeek) });
  const createMutation = useMutation({
    mutationFn: window.habitApi.planner.createBlock,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TimeBlock> }) =>
      window.habitApi.planner.updateBlock(id, input),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: window.habitApi.planner.deleteBlock,
    onSuccess: invalidate,
  });
  const applyTemplateMutation = useMutation({
    mutationFn: (templateId: string) =>
      window.habitApi.planner.applyTemplate(templateId, selectedWeek),
    onSuccess: invalidate,
  });
  const saveTemplateMutation = useMutation({
    mutationFn: () =>
      window.habitApi.planner.saveTemplate({
        name: window.prompt("Template name", "My week") ?? "My week",
        weekStartDate: selectedWeek,
      }),
    onSuccess: invalidate,
  });

  const data = weekQuery.data;
  const slots = useMemo(
    () =>
      data
        ? buildTimeSlots(
            data.settings.visibleStartTime,
            data.settings.visibleEndTime,
            data.settings.slotMinutes,
          )
        : [],
    [data],
  );

  if (!data) return <div className="page-status">Loading planner...</div>;

  const addDraftTile = () => {
    const title = draftTitle.trim() || "New block";
    setDraftTiles((tiles) => [
      ...tiles,
      {
        id: `draft:${crypto.randomUUID()}`,
        title,
        category: inferCategory(title),
        durationMinutes: Math.max(15, data.settings.slotMinutes),
      },
    ]);
    setDraftTitle("");
  };

  const generateProposals = () => {
    setProposals(generateCoachFillProposals(data, habitsQuery.data ?? []));
  };

  const applyProposal = async (proposal: PlannerProposal) => {
    await createMutation.mutateAsync(proposal);
    setProposals((current) => current.filter((item) => item !== proposal));
  };

  const applyAllProposals = async () => {
    for (const proposal of proposals)
      await createMutation.mutateAsync(proposal);
    setProposals([]);
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const blockId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId.startsWith("slot:")) return;
    const [, date, ...timeParts] = overId.split(":");
    const startTime = timeParts.join(":");
    if (!date || !startTime) return;
    if (blockId.startsWith("draft:")) {
      const draft = draftTiles.find((item) => item.id === blockId);
      if (!draft) return;
      createMutation.mutate({
        weekStartDate: selectedWeek,
        date,
        startTime,
        endTime: timeFromMinutes(
          minutesFromTime(startTime) + draft.durationMinutes,
        ),
        title: draft.title,
        category: draft.category,
      });
      setDraftTiles((tiles) => tiles.filter((tile) => tile.id !== blockId));
      return;
    }
    if (blockId.startsWith("todo:")) {
      const todo = data.todos.find((item) => item.id === blockId.slice(5));
      if (!todo) return;
      createMutation.mutate({
        weekStartDate: selectedWeek,
        date,
        startTime,
        endTime: timeFromMinutes(
          minutesFromTime(startTime) + (todo.estimatedMinutes ?? 30),
        ),
        title: todo.title,
        category: "todo",
        todoId: todo.id,
      });
      return;
    }
    if (blockId.startsWith("habit:")) {
      const habit = habitsQuery.data?.find(
        (item) => item.id === blockId.slice(6),
      );
      if (!habit) return;
      createMutation.mutate({
        weekStartDate: selectedWeek,
        date,
        startTime,
        endTime: timeFromMinutes(
          minutesFromTime(startTime) + Math.max(15, habit.minimumValue ?? 25),
        ),
        title: `${habit.emoji ?? ""} ${habit.name}`.trim(),
        category: habit.category ?? "habit",
        habitId: habit.id,
      });
      return;
    }
    const block = data.blocks.find((item) => item.id === blockId);
    if (!block || block.isLocked) return;
    const duration = Math.max(
      15,
      minutesFromTime(block.endTime) - minutesFromTime(block.startTime),
    );
    updateMutation.mutate({
      id: block.id,
      input: {
        date,
        startTime,
        endTime: timeFromMinutes(minutesFromTime(startTime) + duration),
      },
    });
  };

  return (
    <div className={`planner-page ${plannerDensity}`}>
      <header className="planner-toolbar panel">
        <div>
          <p className="eyebrow">Custom weekly table</p>
          <h1>Week Planner</h1>
        </div>
        <label>
          Week
          <input
            type="date"
            value={selectedWeek}
            onChange={(event) =>
              setSelectedWeek(startOfWeek(event.target.value || todayKey()))
            }
          />
        </label>
        <div className="inline-form wide">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Block title"
          />
          <button onClick={addDraftTile}>
            <Plus size={16} /> Add tile
          </button>
        </div>
        <select
          onChange={(event) =>
            event.target.value &&
            applyTemplateMutation.mutate(event.target.value)
          }
          defaultValue=""
        >
          <option value="">Apply template...</option>
          {data.templates.map((template) => (
            <option value={template.id} key={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <div className="planner-toolbar-actions">
          <button onClick={generateProposals}>Coach fill</button>
          <button
            onClick={() =>
              setPlannerDensity(
                plannerDensity === "compact" ? "comfortable" : "compact",
              )
            }
          >
            {plannerDensity === "compact" ? "Comfort" : "Compact"}
          </button>
        </div>
        <button onClick={() => saveTemplateMutation.mutate()}>
          Save template
        </button>
      </header>

      {proposals.length > 0 && (
        <section className="panel planner-proposals">
          <div className="panel-head">
            <strong>Coach fill proposals</strong>
            <span className="panel-actions">
              <button onClick={applyAllProposals}>Apply all</button>
              <button onClick={() => setProposals([])}>Clear</button>
            </span>
          </div>
          <div className="proposal-list">
            {proposals.map((proposal) => (
              <div
                className="proposal-item"
                key={`${proposal.date}-${proposal.startTime}-${proposal.title}`}
              >
                <span>
                  <strong>{proposal.title}</strong>
                  <small>
                    {formatShortDay(proposal.date)} {proposal.startTime}-
                    {proposal.endTime} · {proposal.reason}
                  </small>
                </span>
                <button onClick={() => applyProposal(proposal)}>Apply</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.warnings.length > 0 && (
        <section className="planner-warnings">
          {data.warnings.map((warning) => (
            <div
              className={`planner-warning ${warning.severity}`}
              key={warning.id}
            >
              {warning.message}
            </div>
          ))}
        </section>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={onDragEnd}
      >
        <section className="planner-layout">
          <aside className="panel planner-sidebar">
            {draftTiles.length > 0 && (
              <>
                <strong>Custom tiles</strong>
                {draftTiles.map((tile) => (
                  <DraggableSidebarItem key={tile.id} id={tile.id}>
                    {tile.title}
                  </DraggableSidebarItem>
                ))}
              </>
            )}
            <strong>Unscheduled tasks</strong>
            {data.todos
              .filter((todo) => todo.status === "open")
              .map((todo) => (
                <DraggableSidebarItem key={todo.id} id={`todo:${todo.id}`}>
                  {todo.title}
                </DraggableSidebarItem>
              ))}
            <strong className="sidebar-subhead">Habits</strong>
            {(habitsQuery.data ?? []).map((habit) => (
              <DraggableSidebarItem key={habit.id} id={`habit:${habit.id}`}>
                {habit.emoji} {habit.name}
              </DraggableSidebarItem>
            ))}
          </aside>

          <div className="planner-grid-wrap panel">
            <div
              className="planner-grid"
              style={{
                gridTemplateColumns: `70px repeat(${data.days.length}, minmax(104px, 1fr))`,
              }}
            >
              <div className="planner-corner">Time</div>
              {data.days.map((day) => (
                <div className="planner-day-head" key={day}>
                  {formatShortDay(day)}
                </div>
              ))}
              {slots.map((slot) => (
                <PlannerRow
                  key={slot}
                  slot={slot}
                  days={data.days}
                  blocks={data.blocks}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onDuplicate={(block) =>
                    createMutation.mutate({
                      weekStartDate: selectedWeek,
                      date: block.date,
                      startTime: block.startTime,
                      endTime: block.endTime,
                      title: `${block.title} copy`,
                      category: block.category,
                      projectId: block.projectId,
                      habitId: block.habitId,
                      note: block.note,
                    })
                  }
                  onUpdate={(id, input) => updateMutation.mutate({ id, input })}
                  slotMinutes={data.settings.slotMinutes}
                />
              ))}
            </div>
          </div>
        </section>
        <DragOverlay>
          {activeDragId ? (
            <DragPreview
              id={activeDragId}
              data={data}
              habits={habitsQuery.data ?? []}
              drafts={draftTiles}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DraggableSidebarItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  return (
    <button
      ref={setNodeRef}
      className="unscheduled-task"
      data-testid={`planner-drag-${id}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
    >
      {children}
    </button>
  );
}

function PlannerRow({
  slot,
  days,
  blocks,
  onDelete,
  onDuplicate,
  onUpdate,
  slotMinutes,
}: {
  slot: string;
  days: string[];
  blocks: TimeBlock[];
  onDelete: (id: string) => void;
  onDuplicate: (block: TimeBlock) => void;
  onUpdate: (id: string, input: Partial<TimeBlock>) => void;
  slotMinutes: number;
}) {
  return (
    <>
      <div
        className={
          visiblePlannerSlotLabel(slot)
            ? "planner-time hour"
            : "planner-time minor"
        }
      >
        {visiblePlannerSlotLabel(slot)}
      </div>
      {days.map((day) => (
        <PlannerSlot key={`${day}:${slot}`} date={day} slot={slot}>
          {blocks
            .filter((block) => block.date === day && block.startTime === slot)
            .map((block) => (
              <DraggableBlock
                key={block.id}
                block={block}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onUpdate={onUpdate}
                slotMinutes={slotMinutes}
              />
            ))}
        </PlannerSlot>
      ))}
    </>
  );
}

function PlannerSlot({
  date,
  slot,
  children,
}: {
  date: string;
  slot: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot:${date}:${slot}` });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "planner-slot over" : "planner-slot"}
      data-testid={`planner-slot-${date}-${slot}`}
    >
      {children}
    </div>
  );
}

function DraggableBlock({
  block,
  onDelete,
  onDuplicate,
  onUpdate,
  slotMinutes,
}: {
  block: TimeBlock;
  onDelete: (id: string) => void;
  onDuplicate: (block: TimeBlock) => void;
  onUpdate: (id: string, input: Partial<TimeBlock>) => void;
  slotMinutes: number;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: block.id,
    disabled: block.isLocked,
  });
  const span = blockSlotSpan({
    startTime: block.startTime,
    endTime: block.endTime,
    slotMinutes,
    minutesFromTime,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    "--block-slots": span,
  } as CSSProperties & { "--block-slots": number };
  const duration = Math.max(
    15,
    minutesFromTime(block.endTime) - minutesFromTime(block.startTime),
  );
  return (
    <div
      ref={setNodeRef}
      className={`time-block ${block.category} ${block.status}`}
      data-testid={`planner-block-${block.id}`}
      style={style}
      {...listeners}
      {...attributes}
    >
      <strong>{block.title}</strong>
      <small>
        {block.startTime}-{block.endTime}
      </small>
      <div
        className="block-actions"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate(block.id, {
              endTime: timeFromMinutes(
                minutesFromTime(block.startTime) + Math.max(15, duration - 15),
              ),
            });
          }}
        >
          -15
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate(block.id, {
              endTime: timeFromMinutes(minutesFromTime(block.endTime) + 15),
            });
          }}
        >
          +15
        </button>
        <button
          title="Duplicate"
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate(block);
          }}
        >
          <Copy size={12} />
        </button>
        <button
          title="Lock"
          onClick={(event) => {
            event.stopPropagation();
            onUpdate(block.id, { isLocked: !block.isLocked });
          }}
        >
          {block.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          title="Done"
          onClick={(event) => {
            event.stopPropagation();
            onUpdate(block.id, {
              status: block.status === "done" ? "planned" : "done",
            });
          }}
        >
          ✓
        </button>
        <button
          title="Delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(block.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function DragPreview({
  id,
  data,
  habits,
  drafts,
}: {
  id: string;
  data: WeekPlannerData;
  habits: Habit[];
  drafts: Array<{ id: string; title: string }>;
}) {
  const label = getDragLabel(id, data, habits, drafts);
  return <div className="drag-preview">{label}</div>;
}

function getDragLabel(
  id: string,
  data: WeekPlannerData,
  habits: Habit[],
  drafts: Array<{ id: string; title: string }>,
): string {
  if (id.startsWith("todo:"))
    return data.todos.find((todo) => todo.id === id.slice(5))?.title ?? "Todo";
  if (id.startsWith("habit:")) {
    const habit = habits.find((item) => item.id === id.slice(6));
    return habit ? `${habit.emoji ?? ""} ${habit.name}`.trim() : "Habit";
  }
  if (id.startsWith("draft:"))
    return drafts.find((draft) => draft.id === id)?.title ?? "Custom block";
  return data.blocks.find((block) => block.id === id)?.title ?? "Block";
}

function inferCategory(title: string): string {
  const lower = title.toLowerCase();
  if (
    lower.includes("school") ||
    lower.includes("study") ||
    lower.includes("homework")
  )
    return "school";
  if (
    lower.includes("run") ||
    lower.includes("sauna") ||
    lower.includes("sport")
  )
    return "sport";
  if (lower.includes("sleep")) return "sleep";
  if (lower.includes("bible") || lower.includes("prayer")) return "faith";
  if (lower.includes("deep") || lower.includes("build") || lower.includes("ai"))
    return "deep work";
  return "todo";
}
