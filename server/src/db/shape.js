const { Prisma } = require('@prisma/client');

// Converts Prisma rows into the same JSON shape the API returned on MongoDB,
// so the React client keeps working unchanged:
//  - every row gets `_id` (alongside Prisma's `id`)
//  - a relation that wasn't included comes back as its bare id under the old
//    Mongo field name, e.g. `employeeRef: "<id>"` — exactly like an
//    un-populated ref; an included relation comes back as the nested object,
//    like `.populate()`
//  - optional TEXT columns (nullable in MySQL, see schema.prisma) read as ''
//  - BigInt and Decimal columns read as Number
//  - child/join tables that replaced Mongo arrays are folded back into arrays
//    (see SHAPERS below)

const MODELS = new Map(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    {
      fields: new Map(m.fields.map((f) => [f.name, f])),
      singleRelations: m.fields.filter((f) => f.kind === 'object' && !f.isList && f.relationFromFields?.length === 1),
    },
  ])
);

function isTextColumn(field) {
  const native = field.nativeType?.[0];
  return field.type === 'String' && !field.isRequired && (native === 'Text' || native === 'LongText');
}

function userOf(row) {
  // Join rows (reads, members, votes) carry the user under `user`.
  return row.user;
}

const SHAPERS = {
  Conversation(out) {
    if (Array.isArray(out.members)) out.members = out.members.map(userOf);
  },
  Message(out) {
    if (Array.isArray(out.readBy)) out.readBy = out.readBy.map(userOf);
    if (Array.isArray(out.attachments)) {
      out.attachments = [...out.attachments]
        .sort((a, b) => a.position - b.position)
        .map(({ name, type, url }) => ({ name, type, url }));
    }
  },
  Notification(out) {
    if (Array.isArray(out.readBy)) out.readBy = out.readBy.map(userOf);
    if (Array.isArray(out.clearedBy)) out.clearedBy = out.clearedBy.map(userOf);
  },
  WallPost(out) {
    if (Array.isArray(out.reactions)) {
      const reactions = { like: [], love: [], celebrate: [] };
      for (const r of out.reactions) reactions[r.type]?.push(userOf(r));
      out.reactions = reactions;
    }
    if (Array.isArray(out.pollOptions)) {
      out.poll = out.pollQuestion
        ? {
            question: out.pollQuestion,
            closesAt: out.pollClosesAt,
            options: [...out.pollOptions]
              .sort((a, b) => a.position - b.position)
              .map((o) => ({ text: o.text, votes: (o.votes || []).map(userOf) })),
          }
        : null;
      delete out.pollOptions;
    }
    delete out.pollQuestion;
    delete out.pollClosesAt;
  },
  PushSubscription(out) {
    out.keys = { p256dh: out.p256dh, auth: out.auth };
  },
};

function shape(modelName, row) {
  if (row == null || typeof row !== 'object') return row;
  const model = MODELS.get(modelName);
  if (!model) throw new Error(`shape(): unknown model ${modelName}`);

  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const field = model.fields.get(key);
    if (!field) {
      out[key] = value; // e.g. _count, or a computed field added by the caller
    } else if (field.kind === 'object') {
      out[key] = field.isList ? (value || []).map((v) => shape(field.type, v)) : shape(field.type, value);
    } else if (value === null && isTextColumn(field)) {
      out[key] = '';
    } else if (typeof value === 'bigint') {
      out[key] = Number(value);
    } else if (field.type === 'Decimal' && value != null) {
      out[key] = Number(value); // money columns: Prisma's Decimal -> plain number in JSON
    } else {
      out[key] = value;
    }
  }

  // Un-included relation -> bare id under the relation's (old Mongo) name.
  for (const rel of model.singleRelations) {
    const fk = rel.relationFromFields[0];
    if (!(rel.name in row) && fk in row) out[rel.name] = row[fk];
  }

  if ('id' in out) out._id = out.id;
  SHAPERS[modelName]?.(out);
  return out;
}

function shapeMany(modelName, rows) {
  return (rows || []).map((r) => shape(modelName, r));
}

// Mongoose-style select string -> Prisma `select`, always including `id`.
// Old ref names are translated to their FK column: sel('User', 'name employeeRef')
// -> { id: true, name: true, employeeId: true }.
function sel(modelName, fieldsString) {
  const model = MODELS.get(modelName);
  if (!model) throw new Error(`sel(): unknown model ${modelName}`);
  const select = { id: true };
  for (const name of fieldsString.split(/\s+/).filter(Boolean)) {
    if (name === '_id') continue;
    const field = model.fields.get(name);
    if (!field) throw new Error(`sel(): ${modelName} has no field ${name}`);
    if (field.kind === 'object' && !field.isList && field.relationFromFields?.length === 1) {
      select[field.relationFromFields[0]] = true;
    } else {
      select[name] = true;
    }
  }
  return select;
}

module.exports = { shape, shapeMany, sel };
