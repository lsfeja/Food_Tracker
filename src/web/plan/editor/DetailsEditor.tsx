import { CirclePlus, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import * as Format from "../../../shared/format";
import {
  blockMinutes,
  type EnduranceDetails,
  type GeneralDetails,
  type IntervalBlock,
  type IntervalStep,
  newBlock,
  newExercise,
  newSet,
  newStep,
  type StrengthDetails,
  type WorkoutDetails,
} from "../../../shared/workout";
import { ActionSheet } from "../../components/Sheet";
import { Row, Section } from "../../components/ui";
import { IntensitySelect, OptionalNumber, Stepper, TextArea } from "./fields";

/** Editor for the sport-specific payload. */
export function DetailsEditor({ details, onChange, knownNames }: { details: WorkoutDetails; onChange: (details: WorkoutDetails) => void; knownNames: string[] }) {
  switch (details.kind) {
    case "strength":
      return <StrengthEditor workout={details} onChange={onChange} knownNames={knownNames} />;
    case "endurance":
      return <EnduranceEditor workout={details} onChange={onChange} />;
    case "general":
      return <GeneralEditor workout={details} onChange={onChange} />;
  }
}

const replaceAt = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));
const removeAt = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index);

function StrengthEditor({ workout, onChange, knownNames }: { workout: StrengthDetails; onChange: (d: StrengthDetails) => void; knownNames: string[] }) {
  const listId = useId();
  const update = (index: number, exercise: StrengthDetails["exercises"][number]) => onChange({ ...workout, exercises: replaceAt(workout.exercises, index, exercise) });
  return (
    <>
      <datalist id={listId}>
        {knownNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {workout.exercises.map((exercise, index) => (
        <Section
          key={exercise.id}
          header={
            <>
              <span>Exercise {index + 1}</span>
              <span className="spacer" />
              <button type="button" className="icon-button danger" aria-label="Remove exercise" onClick={() => onChange({ ...workout, exercises: removeAt(workout.exercises, index) })}>
                <Trash2 size={16} />
              </button>
            </>
          }
        >
          <div className="list-row compact">
            <input
              className="text-input"
              type="text"
              list={listId}
              autoCapitalize="words"
              placeholder="Exercise name"
              aria-label="Exercise name"
              value={exercise.name}
              autoFocus={!exercise.name && index === workout.exercises.length - 1}
              onChange={(event) => update(index, { ...exercise, name: event.target.value })}
            />
          </div>
          {exercise.sets.map((set, setIndex) => (
            <div key={set.id} className="list-row compact" style={{ gap: 8 }}>
              <span className="grow secondary">Set {setIndex + 1}</span>
              <OptionalNumber
                narrow
                maxFraction={0}
                placeholder="reps"
                value={set.plannedReps}
                onChange={(plannedReps) => update(index, { ...exercise, sets: replaceAt(exercise.sets, setIndex, { ...set, plannedReps }) })}
              />
              <span className="secondary">×</span>
              <OptionalNumber
                maxFraction={2}
                placeholder="kg"
                value={set.plannedWeight}
                onChange={(plannedWeight) => update(index, { ...exercise, sets: replaceAt(exercise.sets, setIndex, { ...set, plannedWeight }) })}
              />
              <span className="secondary">kg</span>
              <button type="button" className="icon-button" aria-label={`Remove set ${setIndex + 1}`} onClick={() => update(index, { ...exercise, sets: removeAt(exercise.sets, setIndex) })}>
                <X size={16} />
              </button>
            </div>
          ))}
          <Row
            className="action"
            onClick={() => {
              const last = exercise.sets[exercise.sets.length - 1];
              update(index, { ...exercise, sets: [...exercise.sets, newSet(last?.plannedReps ?? 8, last?.plannedWeight ?? null)] });
            }}
          >
            <Plus size={20} /> <span className="row-title">Add Set</span>
          </Row>
          <div className="list-row compact">
            <span className="grow">Rest</span>
            <span className="secondary tabular">{exercise.restSeconds ? `${exercise.restSeconds} s` : "Off"}</span>
            <Stepper label="rest" value={exercise.restSeconds ?? 0} min={0} max={600} step={15} onChange={(restSeconds) => update(index, { ...exercise, restSeconds })} />
          </div>
          <TextArea value={exercise.notes} onChange={(notes) => update(index, { ...exercise, notes })} placeholder="Exercise notes" />
        </Section>
      ))}
      <Section>
        <Row className="action" onClick={() => onChange({ ...workout, exercises: [...workout.exercises, newExercise()] })}>
          <CirclePlus size={20} /> <span className="row-title">Add Exercise</span>
        </Row>
      </Section>
      <Section header="Notes">
        <TextArea value={workout.notes} onChange={(notes) => onChange({ ...workout, notes })} placeholder="Notes" />
      </Section>
    </>
  );
}

const blockPresets: { label: string; make: () => IntervalBlock }[] = [
  { label: "Warm-up", make: () => newBlock(1, [newStep("Warm-up", 15, { kind: "zone", value: 1 })]) },
  { label: "Intervals", make: () => newBlock(5, [newStep("Work", 4, { kind: "zone", value: 4 }), newStep("Recovery", 3, { kind: "zone", value: 1 })]) },
  { label: "Steady", make: () => newBlock(1, [newStep("Steady", 20, { kind: "zone", value: 2 })]) },
  { label: "Cool-down", make: () => newBlock(1, [newStep("Cool-down", 10, { kind: "zone", value: 1 })]) },
];

function EnduranceEditor({ workout, onChange }: { workout: EnduranceDetails; onChange: (d: EnduranceDetails) => void }) {
  const [presets, setPresets] = useState(false);
  const total = workout.blocks.reduce((sum, block) => sum + blockMinutes(block), 0);
  const updateBlock = (index: number, block: IntervalBlock) => onChange({ ...workout, blocks: replaceAt(workout.blocks, index, block) });
  const updateStep = (blockIndex: number, block: IntervalBlock, stepIndex: number, step: IntervalStep) =>
    updateBlock(blockIndex, { ...block, steps: replaceAt(block.steps, stepIndex, step) });

  return (
    <>
      <Section header="Target">
        <div className="list-row compact">
          <span className="grow">Duration</span>
          <OptionalNumber maxFraction={0} placeholder="–" label="Duration in minutes" value={workout.durationMinutes} onChange={(durationMinutes) => onChange({ ...workout, durationMinutes })} />
          <span className="secondary">min</span>
        </div>
        <div className="list-row compact">
          <span className="grow">Distance</span>
          <OptionalNumber maxFraction={2} placeholder="–" label="Distance in km" value={workout.distanceKm} onChange={(distanceKm) => onChange({ ...workout, distanceKm })} />
          <span className="secondary">km</span>
        </div>
        <div className="list-row compact">
          <span className="grow">Intensity</span>
          <IntensitySelect value={workout.intensity} onChange={(intensity) => onChange({ ...workout, intensity })} />
        </div>
      </Section>
      {workout.blocks.map((block, blockIndex) => (
        <Section
          key={block.id}
          header={
            <>
              <span>Block {blockIndex + 1}</span>
              <span className="spacer" />
              <button type="button" className="icon-button danger" aria-label="Remove block" onClick={() => onChange({ ...workout, blocks: removeAt(workout.blocks, blockIndex) })}>
                <Trash2 size={16} />
              </button>
            </>
          }
        >
          <div className="list-row compact">
            <span className="grow">Repeats</span>
            <span className="secondary tabular">{block.repeats}×</span>
            <Stepper label="repeats" value={block.repeats} min={1} max={50} onChange={(repeats) => updateBlock(blockIndex, { ...block, repeats })} />
          </div>
          {block.steps.map((step, stepIndex) => (
            <div key={step.id} className="list-row stack" style={{ alignItems: "stretch", gap: 8 }}>
              <div className="row">
                <input
                  className="text-input"
                  type="text"
                  placeholder="Step (e.g. Work, Recovery)"
                  aria-label="Step name"
                  value={step.label}
                  onChange={(event) => updateStep(blockIndex, block, stepIndex, { ...step, label: event.target.value })}
                />
                <button type="button" className="icon-button" aria-label="Remove step" onClick={() => updateBlock(blockIndex, { ...block, steps: removeAt(block.steps, stepIndex) })}>
                  <X size={16} />
                </button>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <OptionalNumber narrow placeholder="min" value={step.durationMinutes} onChange={(durationMinutes) => updateStep(blockIndex, block, stepIndex, { ...step, durationMinutes })} />
                <span className="secondary">min</span>
                <OptionalNumber narrow maxFraction={2} placeholder="km" value={step.distanceKm} onChange={(distanceKm) => updateStep(blockIndex, block, stepIndex, { ...step, distanceKm })} />
                <span className="secondary">km</span>
                <span className="spacer" />
                <IntensitySelect value={step.intensity} onChange={(intensity) => updateStep(blockIndex, block, stepIndex, { ...step, intensity })} />
              </div>
            </div>
          ))}
          <Row className="action" onClick={() => updateBlock(blockIndex, { ...block, steps: [...block.steps, newStep()] })}>
            <Plus size={20} /> <span className="row-title">Add Step</span>
          </Row>
        </Section>
      ))}
      <Section footer={total > 0 ? `Structure: ${Format.duration(total)}` : undefined}>
        <Row className="action" onClick={() => setPresets(true)}>
          <CirclePlus size={20} /> <span className="row-title">Add Interval Block</span>
        </Row>
      </Section>
      <Section header="Notes">
        <TextArea value={workout.notes} onChange={(notes) => onChange({ ...workout, notes })} placeholder="Notes" />
      </Section>
      {presets && (
        <ActionSheet
          title="Add Interval Block"
          onClose={() => setPresets(false)}
          actions={blockPresets.map((preset) => ({ label: preset.label, onSelect: () => onChange({ ...workout, blocks: [...workout.blocks, preset.make()] }) }))}
        />
      )}
    </>
  );
}

function GeneralEditor({ workout, onChange }: { workout: GeneralDetails; onChange: (d: GeneralDetails) => void }) {
  return (
    <>
      <Section>
        <div className="list-row compact">
          <span className="grow">Duration</span>
          <OptionalNumber maxFraction={0} placeholder="–" label="Duration in minutes" value={workout.durationMinutes} onChange={(durationMinutes) => onChange({ ...workout, durationMinutes })} />
          <span className="secondary">min</span>
        </div>
      </Section>
      <Section header="Notes">
        <TextArea value={workout.notes} onChange={(notes) => onChange({ ...workout, notes })} placeholder="What to do" />
      </Section>
    </>
  );
}
