import * as Automerge from '@automerge/automerge';
import {
  type Workspace,
  type WorkspaceCollection,
  type WorkspaceTarget,
  canonical,
  hash,
  parseWorkspace,
  quantityProblems,
  quantityValue,
  recordQuantity,
  workspaceCollectionSchema,
} from '@repo/domain';
import { z } from 'zod';

const collections = workspaceCollectionSchema.options;
const addressSchema = z.tuple([workspaceCollectionSchema, z.string(), z.string()]);
const presenceSchema = z.strictObject({ alive: z.boolean(), revision: z.string() });
const habitScheduleSchema = z.strictObject({ startDate: z.string(), rules: z.array(z.unknown()) });
const quantityEntrySchema = z.strictObject({
  checkInId: z.string(),
  generation: z.string(),
  units: z.number(),
});

export type WorkspaceDocument = {
  format: unknown;
  fields: Record<string, Automerge.ImmutableString>;
  quantities: Record<string, Automerge.ImmutableString>;
  matrixMode: Automerge.ImmutableString;
  matrixRevision: Automerge.ImmutableString;
  includedArchives: Record<string, boolean>;
};

export interface DocumentConflict {
  id: string;
  version: string;
  target: WorkspaceTarget;
  field: string;
  options: { id: string; value: unknown }[];
}

type WorkspaceRecord = Workspace[WorkspaceCollection][string];

export function emptyDocument(): WorkspaceDocument {
  return {
    format: 1,
    fields: {},
    quantities: {},
    matrixMode: new Automerge.ImmutableString('simple'),
    matrixRevision: new Automerge.ImmutableString('initial'),
    includedArchives: {},
  };
}

function key(collection: WorkspaceCollection, id: string, field: string) {
  return JSON.stringify([collection, id, field]);
}

function encode(value: unknown) {
  const json = canonical(value);
  if (json === undefined) {
    throw new Error('invalid_workspace');
  }
  return new Automerge.ImmutableString(json);
}

function scalarString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!Automerge.isImmutableString(value)) {
    throw new Error('invalid_workspace');
  }
  return String(value);
}

function decode(value: unknown): unknown {
  return JSON.parse(scalarString(value));
}

function entries(value: object): [string, unknown][] {
  return Object.entries(value);
}

function records(
  workspace: Workspace,
  collection: WorkspaceCollection,
): Record<string, WorkspaceRecord> {
  return workspace[collection];
}

function writeQuantity(
  doc: WorkspaceDocument,
  checkInId: string,
  before: Workspace['checkIns'][string] | undefined,
  after: Workspace['checkIns'][string],
) {
  if (before && canonical(before.quantity) === canonical(after.quantity)) {
    return;
  }
  if (before?.quantity.generation !== after.quantity.generation) {
    doc.fields[key('checkIns', checkInId, 'quantityGeneration')] = encode(
      after.quantity.generation,
    );
  }
  // Preserve validated local totals for review if concurrent increments violate the bounds.
  doc.fields[key('checkIns', checkInId, '$quantityValue')] = encode(quantityValue(after.quantity));
  for (const id of Object.keys(before?.quantity.adjustments ?? {})) {
    if (!Object.hasOwn(after.quantity.adjustments, id)) {
      delete doc.quantities[id];
    }
  }
  for (const [id, adjustment] of Object.entries(after.quantity.adjustments)) {
    if (canonical(before?.quantity.adjustments[id]) !== canonical(adjustment)) {
      doc.quantities[id] = encode({ checkInId, ...adjustment });
    }
  }
}

export function writeWorkspace(doc: WorkspaceDocument, before: Workspace, after: Workspace) {
  for (const collection of collections) {
    const previous = records(before, collection);
    const current = records(after, collection);
    const identifiers = new Set([...Object.keys(previous), ...Object.keys(current)]);
    for (const id of identifiers) {
      const old = previous[id];
      const record = current[id];
      if (old === record || canonical(old) === canonical(record)) {
        continue;
      }
      const revision = crypto.randomUUID();
      const presence = key(collection, id, '$presence');
      const alternatives = Automerge.getConflicts(doc.fields, presence);
      const unresolvedDeletion =
        alternatives &&
        new Set(
          Object.values(alternatives).map((value) => presenceSchema.parse(decode(value)).alive),
        ).size > 1;
      if (!unresolvedDeletion || !old || !record) {
        doc.fields[presence] = encode({ alive: Boolean(record), revision });
      }
      doc.fields[key(collection, id, '$revision')] = encode(revision);
      if (!record) {
        continue;
      }
      for (const [field, value] of entries(record)) {
        if (
          field === 'id' ||
          field === 'quantity' ||
          ('rules' in record && (field === 'startDate' || field === 'rules'))
        ) {
          continue;
        }
        const oldValue = old && entries(old).find(([name]) => name === field)?.[1];
        if (canonical(oldValue) !== canonical(value)) {
          doc.fields[key(collection, id, field)] = encode(value);
        }
      }
      if ('quantity' in record) {
        writeQuantity(doc, id, old && 'quantity' in old ? old : undefined, record);
      }
      if ('rules' in record && 'startDate' in record) {
        const schedule = { startDate: record.startDate, rules: record.rules };
        const previous =
          old && 'rules' in old && 'startDate' in old
            ? { startDate: old.startDate, rules: old.rules }
            : undefined;
        if (canonical(previous) !== canonical(schedule)) {
          doc.fields[key(collection, id, 'habitSchedule')] = encode(schedule);
        }
      }
    }
  }
  if (before.matrixMode !== after.matrixMode) {
    doc.matrixMode = new Automerge.ImmutableString(after.matrixMode);
    doc.matrixRevision = new Automerge.ImmutableString(crypto.randomUUID());
  }
}

function cellValue(doc: Automerge.Doc<WorkspaceDocument>, fieldKey: string, field: string) {
  const value = decode(doc.fields[fieldKey]);
  if (field !== 'createdAt' && field !== 'updatedAt') {
    return value;
  }
  const options = Automerge.getConflicts(doc.fields, fieldKey);
  if (!options) {
    return value;
  }
  const timestamps = Object.values(options)
    .map((option) => z.string().parse(decode(option)))
    .sort();
  return field === 'createdAt' ? timestamps[0] : timestamps.at(-1);
}

export function readWorkspace(doc: Automerge.Doc<WorkspaceDocument>): Workspace {
  if (doc.format !== 1) {
    throw new Error('invalid_workspace');
  }
  const result: Record<WorkspaceCollection, Record<string, unknown>> = {
    tasks: {},
    lists: {},
    labels: {},
    habits: {},
    checkIns: {},
    quadrants: {},
  };
  const rows = new Map<
    string,
    { collection: WorkspaceCollection; id: string; data: Record<string, unknown>; alive: boolean }
  >();
  for (const fieldKey of Object.keys(doc.fields)) {
    const [collection, id, field] = addressSchema.parse(JSON.parse(fieldKey));
    const rowKey = JSON.stringify([collection, id]);
    let row = rows.get(rowKey);
    if (!row) {
      row = { collection, id, data: { id }, alive: false };
      rows.set(rowKey, row);
    }
    if (field === '$presence') {
      const alternatives = Automerge.getConflicts(doc.fields, fieldKey);
      const states = alternatives ? Object.values(alternatives) : [doc.fields[fieldKey]];
      // A concurrent deletion remains a review decision, rather than hiding the edited record.
      row.alive = states.some((state) => presenceSchema.parse(decode(state)).alive);
    } else if (field === 'habitSchedule') {
      Object.assign(row.data, habitScheduleSchema.parse(decode(doc.fields[fieldKey])));
    } else if (field !== '$revision' && field !== '$quantityValue') {
      row.data[field] = cellValue(doc, fieldKey, field);
    }
  }
  const quantities = new Map<string, Record<string, { generation: string; units: number }>>();
  for (const [id, value] of Object.entries(doc.quantities)) {
    const { checkInId, generation, units } = quantityEntrySchema.parse(decode(value));
    const adjustments = quantities.get(checkInId) ?? {};
    adjustments[id] = { generation, units };
    quantities.set(checkInId, adjustments);
  }
  for (const row of rows.values()) {
    if (!row.alive) {
      continue;
    }
    if (row.collection === 'checkIns') {
      const generation = z.string().parse(row.data.quantityGeneration);
      delete row.data.quantityGeneration;
      row.data.quantity = { generation, adjustments: quantities.get(row.id) ?? {} };
    }
    const target = result[row.collection];
    target[row.id] = row.data;
  }
  return parseWorkspace({ ...result, matrixMode: String(doc.matrixMode) });
}

export function documentConflicts(
  doc: Automerge.Doc<WorkspaceDocument>,
  workspace = readWorkspace(doc),
): DocumentConflict[] {
  const result: Omit<DocumentConflict, 'version'>[] = [];
  for (const fieldKey of Object.keys(doc.fields)) {
    const conflict = Automerge.getConflicts(doc.fields, fieldKey);
    if (!conflict) {
      continue;
    }
    const [collection, id, field] = addressSchema.parse(JSON.parse(fieldKey));
    if (!workspace[collection][id]) {
      continue;
    }
    if (
      field === '$revision' ||
      field === '$quantityValue' ||
      field === 'quantityGeneration' ||
      field === 'createdAt' ||
      field === 'updatedAt' ||
      field === 'generatedDigest'
    ) {
      continue;
    }
    const options = Object.entries(conflict).map(([id, value]) => ({ id, value: decode(value) }));
    if (field === '$presence') {
      const states = new Set(options.map((option) => presenceSchema.parse(option.value).alive));
      if (states.size < 2) {
        continue;
      }
    } else if (new Set(options.map((option) => canonical(option.value))).size < 2) {
      continue;
    }
    result.push({ id: fieldKey, target: { collection, id }, field, options });
  }
  for (const checkIn of Object.values(workspace.checkIns)) {
    const generationKey = key('checkIns', checkIn.id, 'quantityGeneration');
    const generations = Automerge.getConflicts(doc.fields, generationKey);
    const generationConflict =
      generations && new Set(Object.values(generations).map(decode)).size > 1;
    if (!quantityProblems(checkIn.quantity).length && !generationConflict) {
      continue;
    }
    const valueKey = key('checkIns', checkIn.id, '$quantityValue');
    const values = Automerge.getConflicts(doc.fields, valueKey);
    const amounts = new Set([
      quantityValue(checkIn.quantity),
      ...Object.values(values ?? { current: doc.fields[valueKey] }).map((value) =>
        z.number().parse(decode(value)),
      ),
    ]);
    const retainedIncrements = Object.fromEntries(
      Object.entries(checkIn.quantity.adjustments)
        .filter(
          ([id, entry]) =>
            entry.generation === checkIn.quantity.generation || id !== entry.generation,
        )
        .map(([id, entry]) => [id, { ...entry, generation: checkIn.quantity.generation }]),
    );
    amounts.add(
      quantityValue({ generation: checkIn.quantity.generation, adjustments: retainedIncrements }),
    );
    result.push({
      id: key('checkIns', checkIn.id, '$quantity'),
      target: { collection: 'checkIns', id: checkIn.id },
      field: '$quantity',
      options: [...amounts]
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1000000000)
        .map((value) => ({ id: String(value), value })),
    });
  }
  const matrix = Automerge.getConflicts(doc, 'matrixMode');
  if (matrix && new Set(Object.values(matrix).map(scalarString)).size > 1) {
    result.push({
      id: 'matrixMode',
      target: { collection: 'workspace', id: 'matrixMode' },
      field: 'matrixMode',
      options: Object.entries(matrix).map(([id, value]) => ({ id, value: scalarString(value) })),
    });
  }
  return result.map((conflict) => ({ ...conflict, version: recordVersion(doc, conflict.target) }));
}

export function recordVersion(doc: Automerge.Doc<WorkspaceDocument>, target: WorkspaceTarget) {
  if (target.collection === 'workspace') {
    const revisions = Automerge.getConflicts(doc, 'matrixRevision');
    return hash(
      JSON.stringify(
        revisions
          ? Object.values(revisions).map(scalarString).sort()
          : scalarString(doc.matrixRevision),
      ),
    );
  }
  const field = key(target.collection, target.id, '$revision');
  const alternatives = Automerge.getConflicts(doc.fields, field);
  return hash(
    JSON.stringify(
      alternatives
        ? Object.values(alternatives).map(scalarString).sort()
        : doc.fields[field]
          ? scalarString(doc.fields[field])
          : 'absent',
    ),
  );
}

export function resolveDocumentConflict(
  doc: WorkspaceDocument,
  conflict: DocumentConflict,
  optionId: string,
) {
  if (recordVersion(doc, conflict.target) !== conflict.version) {
    throw new Error('edit_conflict');
  }
  const option = conflict.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    throw new Error('edit_conflict');
  }
  if (conflict.field === 'matrixMode') {
    doc.matrixMode = new Automerge.ImmutableString(
      z.enum(['simple', 'complex']).parse(option.value),
    );
    doc.matrixRevision = new Automerge.ImmutableString(crypto.randomUUID());
  } else if (conflict.field === '$quantity') {
    const checkIn = readWorkspace(doc).checkIns[conflict.target.id];
    if (!checkIn) {
      throw new Error('edit_conflict');
    }
    writeQuantity(doc, checkIn.id, checkIn, {
      ...checkIn,
      quantity: recordQuantity(z.number().parse(option.value), crypto.randomUUID()),
    });
    doc.fields[key('checkIns', checkIn.id, '$revision')] = encode(crypto.randomUUID());
  } else {
    doc.fields[conflict.id] = encode(option.value);
    if (conflict.target.collection !== 'workspace') {
      doc.fields[key(conflict.target.collection, conflict.target.id, '$revision')] = encode(
        crypto.randomUUID(),
      );
    }
  }
}
