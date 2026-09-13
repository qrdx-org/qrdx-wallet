"""
Fund an address on the local QRDX testnet, for end-to-end UI tests.

Sends from the genesis-prefunded account for private key 1 — the only account
on the local chain whose key is public, which is what makes it usable as a
faucet. Signs a legacy EIP-155 transaction because the QRDX node's
eth_sendRawTransaction only decodes untyped nine-field payloads.

Usage:  fund_account.py <0x-address> <amount-in-QRDX>
"""

import json
import sys
import urllib.request

from eth_account import Account
from eth_utils import to_checksum_address

RPC = "http://127.0.0.1:3007/rpc"
FAUCET_KEY = "0x" + "00" * 31 + "01"


def rpc(method, params):
    req = urllib.request.Request(
        RPC,
        data=json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        payload = json.load(r)
    if "error" in payload:
        raise RuntimeError(f"{method}: {payload['error']}")
    return payload["result"]


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip())
        return 2

    # eth_account rejects an address that is not EIP-55 checksummed, but
    # addresses are routinely pasted in lowercase (and that form is perfectly
    # valid on the wire). Normalise rather than making the caller do it.
    try:
        recipient = to_checksum_address(sys.argv[1])
    except ValueError as exc:
        print(f"not a valid address: {sys.argv[1]} ({exc})", file=sys.stderr)
        return 2

    amount_wei = int(float(sys.argv[2]) * 10**18)

    sender = Account.from_key(FAUCET_KEY).address
    chain_id = int(rpc("eth_chainId", []), 16)
    nonce = int(rpc("eth_getTransactionCount", [sender, "latest"]), 16)

    signed = Account.sign_transaction(
        {
            "nonce": nonce,
            "gasPrice": 10**9,
            "gas": 21000,
            "to": recipient,
            "value": amount_wei,
            "data": b"",
            # Sign for the chain the node actually reports, not an assumed value.
            "chainId": chain_id,
        },
        FAUCET_KEY,
    )

    tx_hash = rpc("eth_sendRawTransaction", ["0x" + signed.raw_transaction.hex()])
    balance = int(rpc("eth_getBalance", [recipient, "latest"]), 16)

    print(f"funded {recipient}")
    print(f"  chain    {chain_id}")
    print(f"  tx       {tx_hash}")
    print(f"  balance  {balance / 10**18:g} QRDX")
    return 0


if __name__ == "__main__":
    sys.exit(main())
