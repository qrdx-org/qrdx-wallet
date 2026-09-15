"""
liboqs bridge for the wallet's PQ cross-implementation tests.

Reads one JSON request on stdin and writes one JSON reply on stdout. Uses the
node's own modules where it can (qrdx.crypto.pq.dilithium, qrdx.crypto.address)
so the comparison is against the code the chain actually runs, not a
reimplementation of it.

Operations:
  {"op": "info"}
  {"op": "sign",   "message": hex}
  {"op": "verify", "public_key": hex, "message": hex, "signature": hex}
  {"op": "address","public_key": hex}
  {"op": "check_public_key", "public_key": hex}
"""

import contextlib
import io
import json
import os
import sys

# Import the node's package rather than duplicating its logic.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ref", "qrdx-chain"))

# liboqs-python prints a faulthandler banner (and the node's modules log) to
# stdout on import. This protocol is one JSON document on stdout, so capture
# anything written during import and forward it to stderr instead.
_import_noise = io.StringIO()
with contextlib.redirect_stdout(_import_noise):
    import oqs  # noqa: E402
if _import_noise.getvalue():
    print(_import_noise.getvalue(), file=sys.stderr, end="")


def working_algorithm() -> str:
    enabled = oqs.get_enabled_sig_mechanisms()
    for name in ("ML-DSA-65", "Dilithium3"):
        if name in enabled:
            return name
    raise RuntimeError("no ML-DSA-65 / Dilithium3 mechanism in this liboqs build")


def main() -> int:
    req = json.load(sys.stdin)
    op = req.get("op")
    alg = working_algorithm()

    # Node modules log on import too; keep stdout clean for the reply.
    noise = io.StringIO()

    if op == "info":
        with oqs.Signature(alg) as s:
            d = s.details
            out = {
                "algorithm": alg,
                "public_key_length": d["length_public_key"],
                "signature_length": d["length_signature"],
            }

    elif op == "sign":
        message = bytes.fromhex(req["message"])
        with oqs.Signature(alg) as signer:
            public_key = signer.generate_keypair()
            signature = signer.sign(message)
        out = {"public_key": public_key.hex(), "signature": signature.hex()}

    elif op == "verify":
        with oqs.Signature(alg) as verifier:
            try:
                valid = verifier.verify(
                    bytes.fromhex(req["message"]),
                    bytes.fromhex(req["signature"]),
                    bytes.fromhex(req["public_key"]),
                )
            except Exception:
                # liboqs raises on some malformed inputs; for a verifier that is
                # simply "not valid".
                valid = False
        out = {"valid": bool(valid)}

    elif op == "address":
        # Use the node's own derivation so this test fails if either side moves.
        with contextlib.redirect_stdout(noise):
            from qrdx.crypto.address import public_key_to_address, AddressType
        import hashlib

        pub = bytes.fromhex(req["public_key"])
        out = {
            "address": public_key_to_address(pub, AddressType.POST_QUANTUM),
            "fingerprint": hashlib.sha256(pub).digest()[:8].hex(),
        }

    elif op == "check_public_key":
        with contextlib.redirect_stdout(noise):
            from qrdx.crypto.pq.dilithium import PQPublicKey

        try:
            PQPublicKey.from_hex(req["public_key"])
            out = {"ok": True}
        except Exception as exc:
            out = {"ok": False, "error": str(exc)}

    else:
        out = {"error": f"unknown op: {op}"}

    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
