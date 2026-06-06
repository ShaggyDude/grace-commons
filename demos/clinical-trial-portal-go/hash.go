package main

import (
	"crypto/sha256"
	"encoding/hex"
)

// sha256hex — SHA-256 of input as lowercase hex. Same primitive as render 1/2's
// lib/hash.ts (node:crypto createHash("sha256")); SHA-256 is bit-identical across
// languages, so a Go-produced hash equals the JS one for the same canonical bytes.
func sha256hex(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}
