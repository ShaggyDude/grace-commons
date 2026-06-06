package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// canonicalize mirrors render 1/2's lib/canonical.ts BYTE-FOR-BYTE: keys sorted
// lexicographically at every level, no whitespace, JSON.stringify semantics for
// primitives. The audit hash chain's cross-render portability depends on this
// producing exactly the same bytes as the TS/JS canonicalize (BUILD_PLAN §6.1).
//
// The TS source it ports:
//
//	export function canonicalize(value: unknown): string {
//	  if (value === null || typeof value !== "object") return JSON.stringify(value);
//	  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
//	  const keys = Object.keys(value as object).sort();
//	  return "{" + keys.map((k) =>
//	    JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
//	}
//
// Cross-language gotchas this port pins (the generator signal — see README):
//   - Go's encoding/json HTML-escapes <, >, & by default; JS JSON.stringify does
//     NOT. We disable it (SetEscapeHTML(false)) so string output matches JS.
//   - Map keys are sorted with sort.Strings (byte order). For the ASCII keys this
//     demo uses that equals JS's UTF-16 .sort(); non-ASCII keys would need care.
//   - Numbers here are always integers (ids); float formatting differs across
//     languages and is deliberately unsupported until pinned (panics loudly).
func canonicalize(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return jsonString(x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			parts[i] = canonicalize(e)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = jsonString(k) + ":" + canonicalize(x[k])
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		// float64 etc. — JS's number formatting (shortest round-trip, no ".0" for
		// integral values) is non-trivial to match exactly. The demo payloads have
		// no non-integer numbers, so fail loudly rather than hash divergent bytes.
		panic(fmt.Sprintf("canonicalize: unsupported type %T — pin its JS-equivalent formatting before hashing", v))
	}
}

// jsonString encodes a string the way JS JSON.stringify does — crucially with
// HTML escaping OFF (Go's default would emit < / > / &).
func jsonString(s string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s) // Encode appends a trailing newline
	return strings.TrimRight(buf.String(), "\n")
}
