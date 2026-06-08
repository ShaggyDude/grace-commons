// schema.mjs — the Mongo rendering of migrations/0001_init.sql (render 2's
// Postgres schema), with the enforcement seam made EXPLICIT.
//
// This file is the discovery instrumentation of this render: every invariant
// the Postgres schema enforced declaratively is either (a) re-expressed here as
// a $jsonSchema validator or a unique index — Mongo enforces it; or (b) named
// here as NOT EXPRESSIBLE in Mongo schema — app code in portal.mjs enforces it.
// The full invariant → enforcer table is in README.md.
//
// What ports, what doesn't (the headline):
//   NOT NULL            → $jsonSchema `required` + bsonType        (ports)
//   CHECK (enum)        → $jsonSchema `enum`                       (ports)
//   UNIQUE              → unique index                             (ports)
//   single-row CHECK    → $jsonSchema enum on _id                  (ports)
//   REFERENCES (FK)     → NO Mongo equivalent → app code (portal.mjs `fkExists`)
//   ON DELETE RESTRICT  → NO Mongo equivalent → no delete surface exists in the
//                         core at all; Postgres actively blocks deletes, Mongo
//                         merely has nothing that deletes (weaker class — README)
//   IDENTITY / sequence → counters collection, $inc inside the transaction
//   advisory-lock serialization → replica-set transaction + optimistic retry
//                         (the 4th conforming mechanism — see portal.mjs append)
//
// BSON-coercion discipline (the byte-identity hazard): occurred_at,
// payload_json, prev_hash, this_hash are REQUIRED to be bsonType "string" by
// the event_log validator below — storing a Date or a nested document there is
// REJECTED BY THE ENGINE, so the "store the hashed fields as opaque strings"
// rule is machine-enforced, not convention.

const str = { bsonType: "string" };
const strOrNull = { bsonType: ["string", "null"] };
const int = { bsonType: ["int", "long", "double"] }; // JS number; small ints land as int32
const intOrNull = { bsonType: ["int", "long", "double", "null"] };

/** collection name → { validator, indexes: [[keys, options], …] } */
export const SCHEMA = {
  // Party Identity atom  (parties: email NOT NULL UNIQUE, display_name/created_at NOT NULL)
  parties: {
    validator: {
      $jsonSchema: {
        required: ["_id", "email", "display_name", "created_at"],
        properties: { _id: int, email: str, display_name: str, created_at: str },
      },
    },
    indexes: [[{ email: 1 }, { unique: true }]], // UNIQUE(email)
  },

  // Actor Identity atom  (party_id REFERENCES parties → app code)
  actors: {
    validator: {
      $jsonSchema: {
        required: ["_id", "party_id", "created_at"],
        properties: { _id: int, party_id: int, created_at: str },
      },
    },
    indexes: [],
  },

  // Credential atom  (kind CHECK IN ('password'); actor_id FK → app code)
  credentials: {
    validator: {
      $jsonSchema: {
        required: ["_id", "actor_id", "kind", "secret_hash", "created_at"],
        properties: {
          _id: int, actor_id: int, kind: { enum: ["password"] },
          secret_hash: str, created_at: str, revoked_at: strOrNull,
        },
      },
    },
    indexes: [],
  },

  // Session atom  (token NOT NULL UNIQUE; actor_id FK → app code)
  sessions: {
    validator: {
      $jsonSchema: {
        required: ["_id", "actor_id", "token", "issued_at", "expires_at"],
        properties: {
          _id: int, actor_id: int, token: str,
          issued_at: str, expires_at: str, revoked_at: strOrNull,
        },
      },
    },
    indexes: [[{ token: 1 }, { unique: true }]], // UNIQUE(token)
  },

  // Permissions atom: registry  (code NOT NULL UNIQUE)
  permissions: {
    validator: {
      $jsonSchema: {
        required: ["_id", "code", "label"],
        properties: { _id: int, code: str, label: str },
      },
    },
    indexes: [[{ code: 1 }, { unique: true }]], // UNIQUE(code)
  },

  // Permissions atom: grants  (scope CHECK IN ('all','own'); three FKs → app code;
  // idx_grants_grantee was a PARTIAL non-unique index (WHERE revoked_at IS NULL)
  // — performance, not an invariant. Mongo partialFilterExpression cannot match
  // null, so this is a plain index here; the delta is logged in CORNERS.md.)
  grants: {
    validator: {
      $jsonSchema: {
        required: ["_id", "grantor_actor_id", "grantee_actor_id", "permission_id", "scope", "issued_at"],
        properties: {
          _id: int, grantor_actor_id: int, grantee_actor_id: int, permission_id: int,
          scope: { enum: ["all", "own"] },
          issued_at: str, revoked_at: strOrNull, revoke_reason: strOrNull,
        },
      },
    },
    indexes: [[{ grantee_actor_id: 1, permission_id: 1 }, {}]],
  },

  // Invitation atom  (token NOT NULL UNIQUE; party_id / issued_by / accepted_by FKs → app code)
  invitations: {
    validator: {
      $jsonSchema: {
        required: ["_id", "party_id", "intended_role", "token", "issued_by_actor_id", "issued_at", "expires_at"],
        properties: {
          _id: int, party_id: int, intended_role: str, token: str,
          issued_by_actor_id: int, issued_at: str, expires_at: str,
          accepted_at: strOrNull, accepted_by_actor_id: intOrNull, revoked_at: strOrNull,
        },
      },
    },
    indexes: [[{ token: 1 }, { unique: true }]], // UNIQUE(token)
  },

  // Event Log atom (C1 audit substrate).
  // _id is the explicit chain position (render 2: "id is NOT an IDENTITY: it is
  // part of the hashed payload") — _id's implicit unique index is the fork
  // guard for the append serialization mechanism (portal.mjs).
  // occurred_at / payload_json / prev_hash / this_hash MUST be strings: this is
  // the opaque-strings rule, enforced by the engine.
  event_log: {
    validator: {
      $jsonSchema: {
        required: ["_id", "occurred_at", "actor_id", "session_id", "action", "payload_json", "prev_hash", "this_hash"],
        properties: {
          _id: int,
          occurred_at: str,                 // ISO-8601 TEXT; hashed verbatim — never a BSON Date
          actor_id: intOrNull,              // nullable: anonymous events (login.failed)
          session_id: intOrNull,
          action: str,
          target_kind: strOrNull,
          target_id: intOrNull,
          payload_json: str,                // canonicalized JSON string — never a nested document
          prev_hash: str,                   // '' for row #1
          this_hash: str,
        },
      },
    },
    indexes: [
      [{ this_hash: 1 }, { unique: true }], // UNIQUE(this_hash)
      [{ actor_id: 1 }, {}],                // idx_event_log_actor
      [{ target_kind: 1, target_id: 1 }, {}], // idx_event_log_target
      [{ action: 1 }, {}],                  // idx_event_log_action
      [{ occurred_at: 1 }, {}],             // idx_event_log_time
    ],
  },

  // Retention Window atom: configuration only, single-row (CHECK (id = 1))
  retention_policy: {
    validator: {
      $jsonSchema: {
        required: ["_id", "days", "enforce_on_read"],
        properties: { _id: { enum: [1] }, days: int, enforce_on_read: { bsonType: "bool" } },
      },
    },
    indexes: [],
  },

  // Regulated-artifact collections (not atoms — what the audit trail attributes)
  studies: {
    validator: {
      $jsonSchema: {
        required: ["_id", "protocol_number", "title", "created_at"],
        properties: { _id: int, protocol_number: str, title: str, created_at: str },
      },
    },
    indexes: [[{ protocol_number: 1 }, { unique: true }]], // UNIQUE(protocol_number)
  },

  subjects: {
    validator: {
      $jsonSchema: {
        required: ["_id", "study_id", "subject_code", "status", "enrolled_by_actor_id", "enrolled_at"],
        properties: {
          _id: int, study_id: int, subject_code: str,
          status: { enum: ["screening", "enrolled", "withdrawn", "completed"] }, // CHECK(status IN …)
          enrolled_by_actor_id: int, enrolled_at: str, notes: strOrNull,
        },
      },
    },
    indexes: [[{ subject_code: 1 }, { unique: true }]], // UNIQUE(subject_code)
  },

  visits: {
    validator: {
      $jsonSchema: {
        required: ["_id", "subject_id", "visit_kind", "recorded_by_actor_id", "recorded_at"],
        properties: {
          _id: int, subject_id: int, visit_kind: str,
          recorded_by_actor_id: int, recorded_at: str, notes: strOrNull,
        },
      },
    },
    indexes: [],
  },

  // id allocation for everything EXCEPT event_log (whose _id is tail+1 under
  // the append serialization mechanism). The $inc runs INSIDE the op's
  // transaction, so an aborted/retried op never leaks an id (no IDENTITY gaps).
  counters: { validator: undefined, indexes: [] },
};

/** Create every collection with its validator + indexes. Idempotent. */
export async function ensureSchema(db) {
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const [name, { validator, indexes }] of Object.entries(SCHEMA)) {
    if (!existing.has(name)) {
      await db.createCollection(name, validator ? { validator, validationLevel: "strict", validationAction: "error" } : {});
    }
    for (const [keys, options] of indexes) {
      await db.collection(name).createIndex(keys, options);
    }
  }
}
