"""
Prefund a post-quantum address on the local testnet, for end-to-end tests.

A `0xPQ` address cannot be funded with an EVM transaction: the transaction
recipient field holds 20 bytes and a PQ address is 32. Post-quantum accounts
hold value on the chain's native UTXO layer instead, which is how genesis
prefunds the validator and system wallets.

This writes a UTXO row directly, the same way genesis does. It is a local
testnet fixture and deliberately not something the wallet can do — moving value
on the native layer requires a native transaction signed with the PQ key, which
is separate work.

Usage:  fund_pq_native.py <0xPQ-address> <amount-in-QRDX> [db-path]
"""

import os
import sqlite3
import sys

# The native ledger stores amounts in micro-QRDX (see constants.SMALLEST).
MICRO_PER_QRDX = 10**6
DEFAULT_DB = os.path.join(
    os.path.dirname(__file__), "..", "..", "ref", "qrdx-chain",
    "testnet", "databases", "node0.db",
)


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip())
        return 2

    address = sys.argv[1]
    if not address.startswith("0xPQ"):
        print(f"not a post-quantum address: {address}", file=sys.stderr)
        return 2

    micro = int(float(sys.argv[2]) * MICRO_PER_QRDX)
    db_path = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_DB

    conn = sqlite3.connect(db_path)
    # A synthetic funding output, keyed so repeated runs replace rather than
    # stack up. unspent_outputs has a (tx_hash, output_index) primary key.
    tx_hash = ("pqfund" + address[4:]).encode()[:32].ljust(32, b"\0")

    conn.execute(
        "INSERT OR REPLACE INTO transactions (tx_hash, tx_hex, block_hash) VALUES (?, ?, NULL)",
        (tx_hash, "00"),
    )
    conn.execute(
        "INSERT OR REPLACE INTO unspent_outputs (tx_hash, output_index, address, amount) "
        "VALUES (?, 0, ?, ?)",
        (tx_hash, address, micro),
    )
    conn.commit()

    total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM unspent_outputs WHERE address = ?",
        (address,),
    ).fetchone()[0]

    print(f"prefunded {address}")
    print(f"  native balance  {int(total) / MICRO_PER_QRDX:g} QRDX")
    return 0


if __name__ == "__main__":
    sys.exit(main())
