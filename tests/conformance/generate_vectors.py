#!/usr/bin/env python3
"""
Generate wallet ↔ node conformance vectors from the node's own source.

The wallet must produce byte-identical encodings to the node for three things:
type-0x51 PQ transactions, canonical account ids, and exchange-transaction
signing bytes. Re-implementing those rules in a test would only prove the
wallet agrees with the test author, so this script loads the node's modules
directly from ../qrdx-node and asks *them* for the answers.

It runs on a bare Python 3 with no packages installed: the two third-party
dependencies those modules touch (``rlp`` and a keccak provider) are replaced
by the minimal pure-Python shims below. Both are standard, small and fully
specified, and the RLP shim is checked against the Ethereum RLP test strings
before anything is generated.

Usage:
    python3 tests/conformance/generate_vectors.py [path/to/qrdx-node] > tests/conformance/vectors.json
"""

from __future__ import annotations

import importlib.util
import json
import sys
import types
from pathlib import Path

# ─── keccak-256 (pure Python, original Keccak padding 0x01) ─────────────────

_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
        [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_M = (1 << 64) - 1


def _rol(x: int, n: int) -> int:
    return ((x << n) | (x >> (64 - n))) & _M if n else x


def _keccak_f(a):
    for rc in _RC:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(a[x][y], _ROT[x][y])
        a = [[b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y]) for y in range(5)]
             for x in range(5)]
        a[0][0] ^= rc
    return a


def keccak256(data: bytes) -> bytes:
    rate = 136
    msg = bytearray(data) + b"\x01"
    msg += b"\x00" * ((-len(msg)) % rate)
    msg[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off:off + rate]
        for i in range(rate // 8):
            x, y = i % 5, i // 5
            a[x][y] ^= int.from_bytes(block[8 * i:8 * i + 8], "little")
        a = _keccak_f(a)
    out = b"".join(a[i % 5][i // 5].to_bytes(8, "little") for i in range(4))
    return out


assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"

# ─── RLP (pure Python) ───────────────────────────────────────────────────────


def _len_prefix(length: int, short: int) -> bytes:
    if length < 56:
        return bytes([short + length])
    lb = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([short + 55 + len(lb)]) + lb


def rlp_encode(item) -> bytes:
    if isinstance(item, (bytes, bytearray)):
        item = bytes(item)
        if len(item) == 1 and item[0] < 0x80:
            return item
        return _len_prefix(len(item), 0x80) + item
    if isinstance(item, list):
        body = b"".join(rlp_encode(i) for i in item)
        return _len_prefix(len(body), 0xC0) + body
    raise TypeError(f"cannot RLP-encode {type(item)}")


def _rlp_decode_at(data: bytes, pos: int):
    b0 = data[pos]
    if b0 < 0x80:
        return data[pos:pos + 1], pos + 1
    if b0 < 0xB8:
        n = b0 - 0x80
        return data[pos + 1:pos + 1 + n], pos + 1 + n
    if b0 < 0xC0:
        ll = b0 - 0xB7
        n = int.from_bytes(data[pos + 1:pos + 1 + ll], "big")
        start = pos + 1 + ll
        return data[start:start + n], start + n
    if b0 < 0xF8:
        n, start = b0 - 0xC0, pos + 1
    else:
        ll = b0 - 0xF7
        n = int.from_bytes(data[pos + 1:pos + 1 + ll], "big")
        start = pos + 1 + ll
    items, p = [], start
    while p < start + n:
        it, p = _rlp_decode_at(data, p)
        items.append(it)
    return items, start + n


def rlp_decode(data: bytes):
    item, end = _rlp_decode_at(bytes(data), 0)
    if end != len(data):
        raise ValueError("trailing bytes")
    return item


# Ethereum RLP test strings (ethereum/tests RLPTests/rlptest.json).
assert rlp_encode(b"dog").hex() == "83646f67"
assert rlp_encode([b"cat", b"dog"]).hex() == "c88363617483646f67"
assert rlp_encode(b"").hex() == "80"
assert rlp_encode([]).hex() == "c0"
assert rlp_encode(b"\x0f").hex() == "0f"
assert rlp_encode(b"\x04\x00").hex() == "820400"
assert rlp_encode(b"Lorem ipsum dolor sit amet, consectetur adipisicing elit")[:2].hex() == "b838"
assert rlp_decode(rlp_encode([b"a", [b"bc", b""]])) == [b"a", [b"bc", b""]]

# ─── Wire the shims in, then load node modules by path ──────────────────────

_rlp = types.ModuleType("rlp")
_rlp.encode, _rlp.decode = rlp_encode, rlp_decode
sys.modules["rlp"] = _rlp

_eth_hash = types.ModuleType("eth_hash")
_eth_hash_auto = types.ModuleType("eth_hash.auto")
_eth_hash_auto.keccak = keccak256
sys.modules["eth_hash"], sys.modules["eth_hash.auto"] = _eth_hash, _eth_hash_auto

# qrdx/crypto/hashing.py prefers pycryptodome's keccak.
_crypto = types.ModuleType("Crypto")
_crypto_hash = types.ModuleType("Crypto.Hash")
_crypto_keccak = types.ModuleType("Crypto.Hash.keccak")


class _K:
    def __init__(self):
        self._buf = b""

    def update(self, d):
        self._buf += d
        return self

    def digest(self):
        return keccak256(self._buf)

    def hexdigest(self):
        return self.digest().hex()


_crypto_keccak.new = lambda digest_bits=256, data=b"": _K().update(data)
sys.modules.update({"Crypto": _crypto, "Crypto.Hash": _crypto_hash,
                    "Crypto.Hash.keccak": _crypto_keccak})


def _package(name: str):
    mod = types.ModuleType(name)
    mod.__path__ = []
    sys.modules[name] = mod
    return mod


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


NODE = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[3] / "qrdx-node")
for pkg in ("qrdx", "qrdx.crypto", "qrdx.crypto.pq", "qrdx.transactions", "qrdx.exchange"):
    _package(pkg)

# Sizes only — decode_pq_tx checks them; no signing happens here.
_dil = types.ModuleType("qrdx.crypto.pq.dilithium")
_dil.PUBLIC_KEY_SIZE, _dil.SIGNATURE_SIZE = 1952, 3309
sys.modules["qrdx.crypto.pq.dilithium"] = _dil

# A stub constants module for the exchange envelope's default gas price.
_consts = types.ModuleType("qrdx.constants")
_consts.EXCHANGE_MIN_GAS_PRICE_WEI = 1_000_000_000
_consts.WEI_PER_QRDX = 10 ** 18
sys.modules["qrdx.constants"] = _consts
sys.modules["qrdx"].constants = _consts

hashing = _load("qrdx.crypto.hashing", NODE / "qrdx/crypto/hashing.py")
account_id = _load("qrdx.crypto.account_id", NODE / "qrdx/crypto/account_id.py")
pq_tx = _load("qrdx.transactions.pq_tx", NODE / "qrdx/transactions/pq_tx.py")
ex_tx = _load("qrdx.exchange.transactions", NODE / "qrdx/exchange/transactions.py")

# ─── Vectors ────────────────────────────────────────────────────────────────

ACCOUNT_INPUTS = [
    "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
    "0x0000000000000000000000000000000000000001",
    "0xPQ" + "ab" * 32,
    "0xPQ" + "0123456789abcdef" * 4,
    "0xpq" + "FF" * 32,
    "0xPQMS" + "11" * 19,
]

account_vectors = [{"address": a, "accountId": account_id.to_account_id(a)} for a in ACCOUNT_INPUTS]

# Deterministic stand-in key material of the right sizes. Signing hash and
# encoding are independent of whether the signature verifies.
PUB = bytes((i * 7 + 3) % 256 for i in range(1952))
SIG = bytes((i * 13 + 5) % 256 for i in range(3309))

PQ_CASES = [
    dict(chain_id=9999, nonce=0, gas_price=1_000_000_000, gas_limit=200_000,
         to=bytes.fromhex("742d35cc6634c0532925a3b844bc9e7595f0beb1"), value=10 ** 18, data=b""),
    dict(chain_id=9999, nonce=7, gas_price=1, gas_limit=145_000,
         to=bytes.fromhex(account_id.to_account_id("0xPQ" + "ab" * 32)[2:]), value=123456789, data=b""),
    dict(chain_id=88888, nonce=300, gas_price=2_500_000_000, gas_limit=500_000,
         to=bytes.fromhex("a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), value=0,
         data=bytes.fromhex("a9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb1"
                            "0000000000000000000000000000000000000000000000000de0b6b3a7640000")),
    dict(chain_id=1, nonce=1, gas_price=1, gas_limit=300_000, to=None, value=0, data=b"\x60\x00"),
    dict(chain_id=9999, nonce=2, gas_price=1_000_000_000, gas_limit=200_000,
         to=bytes.fromhex("742d35cc6634c0532925a3b844bc9e7595f0beb1"), value=5,
         data=b"", on_behalf_of=bytes.fromhex("0000000000000000000000000000000000000003")),
]

pq_vectors = []
for case in PQ_CASES:
    tx = pq_tx.PQTransaction(**case, public_key=PUB, signature=SIG)
    raw = tx.encode()
    assert pq_tx.decode_pq_tx(raw).signing_hash() == tx.signing_hash()
    pq_vectors.append({
        "chainId": case["chain_id"], "nonce": case["nonce"], "gasPrice": str(case["gas_price"]),
        "gasLimit": case["gas_limit"], "to": "0x" + case["to"].hex() if case["to"] else None,
        "value": str(case["value"]), "data": "0x" + case["data"].hex(),
        "onBehalfOf": "0x" + case["on_behalf_of"].hex() if case.get("on_behalf_of") else None,
        "signingHash": "0x" + tx.signing_hash().hex(),
        "rawPrefix": "0x" + raw[:64].hex(),
        "rawLength": len(raw),
        "rawKeccak": "0x" + keccak256(raw).hex(),
        "txHash": "0x" + tx.hash().hex(),
        "intrinsicGas": tx.intrinsic_gas(),
    })

# Exchange transactions — the signing bytes the node verifies against.
EX_CASES = [
    dict(op_type=ex_tx.ExchangeOpType.SWAP, sender="0xPQ" + "ab" * 32, nonce=0,
         params={"token_in": "QRDX", "token_out": "0x" + "11" * 20, "amount_in": "1.5",
                 "min_amount_out": "0.9"}, gas_limit=1_000_000, gas_price=1_000_000_000),
    dict(op_type=ex_tx.ExchangeOpType.STAKE_DEPOSIT, sender="0xPQ" + "cd" * 32, nonce=12,
         params={"validator_public_key": "ff" * 8, "stake_amount": "10000"},
         gas_limit=500_000, gas_price=2_000_000_000),
    dict(op_type=ex_tx.ExchangeOpType.TOKEN_TRANSFER, sender="0xPQ" + "ab" * 32, nonce=3,
         params={"token_address": "0x" + "22" * 20, "to": "0xPQ" + "cd" * 32, "amount": "42",
                 "memo": "héllo ✓"}, gas_limit=100_000, gas_price=1_000_000_000),
    dict(op_type=ex_tx.ExchangeOpType.STAKE_EXIT, sender="0xPQ" + "ab" * 32, nonce=4,
         params={}, gas_limit=100_000, gas_price=1_000_000_000),
]

ex_vectors = []
for case in EX_CASES:
    tx = ex_tx.ExchangeTransaction(**case, timestamp=1.0)
    ex_vectors.append({
        "opType": int(case["op_type"]), "sender": case["sender"], "nonce": case["nonce"],
        "params": case["params"], "gasLimit": case["gas_limit"], "gasPrice": str(case["gas_price"]),
        "signingBytes": "0x" + tx.signing_bytes().hex(),
        "txHash": tx.tx_hash(),
    })

# PQ prefixed-message bytes (qrdx/wallet_v2/pq_wallet.py sign_with_prefix).
MESSAGES = ["hello", "", "héllo wörld ✓", "多字节"]
msg_vectors = []
for m in MESSAGES:
    b = m.encode("utf-8")
    prefixed = f"\x19QRDX PQ Signed Message:\n{len(b)}".encode() + b
    msg_vectors.append({"message": m, "prefixed": "0x" + prefixed.hex()})

json.dump({
    "generatedFrom": "qrdx-node (qrdx/crypto/account_id.py, qrdx/transactions/pq_tx.py, "
                     "qrdx/exchange/transactions.py, qrdx/wallet_v2/pq_wallet.py)",
    "pqStandInKey": {"publicKeyRule": "(i*7+3) % 256 for i in range(1952)",
                     "signatureRule": "(i*13+5) % 256 for i in range(3309)"},
    "accountIds": account_vectors,
    "pqTransactions": pq_vectors,
    "exchangeTransactions": ex_vectors,
    "pqMessages": msg_vectors,
}, sys.stdout, indent=2, ensure_ascii=False)
sys.stdout.write("\n")
