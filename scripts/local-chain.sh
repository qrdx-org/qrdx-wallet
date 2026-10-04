#!/usr/bin/env bash
#
# QRDX Wallet — local chain control & health monitor
# ══════════════════════════════════════════════════════════════════════════════
#
# Brings up the QRDX node in ref/qrdx-chain as a single-node local testnet and
# keeps an eye on it, so the wallet always has a chain to develop against.
#
#   ./scripts/local-chain.sh up        start the node and wait until it serves RPC
#   ./scripts/local-chain.sh down      stop the node
#   ./scripts/local-chain.sh restart   down, then up
#   ./scripts/local-chain.sh status    one-shot health report (exit 0 = healthy)
#   ./scripts/local-chain.sh watch     continuous health check until interrupted
#   ./scripts/local-chain.sh logs      tail the node log
#   ./scripts/local-chain.sh fund ADDR [AMOUNT]   send test QRDX to an address
#   ./scripts/local-chain.sh doctor    check prerequisites without starting
#
# Why this wrapper exists rather than calling ref/qrdx-chain/scripts/testnet.sh
# directly: that script needs its virtualenv ahead of the system Python on PATH,
# needs liboqs discoverable, and reports success as soon as the process spawns —
# well before the JSON-RPC surface is actually answering. Everything here is
# about turning that into a single command that either works or says why not.
#
set -uo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The node checkout: $QRDX_NODE_DIR, else ../qrdx-node (mono-repo layout), else ref/qrdx-chain.
if [[ -n "${QRDX_NODE_DIR:-}" ]]; then
  _chain_dir="${QRDX_NODE_DIR}"
elif [[ -f "${REPO_ROOT}/../qrdx-node/qrdx/constants.py" ]]; then
  _chain_dir="$(cd "${REPO_ROOT}/../qrdx-node" && pwd)"
else
  _chain_dir="${REPO_ROOT}/ref/qrdx-chain"
fi
readonly CHAIN_DIR="${_chain_dir}"
readonly VENV="${CHAIN_DIR}/.venv"
readonly VENV_PY="${VENV}/bin/python"
readonly NODE_LOG="${CHAIN_DIR}/testnet/logs/node0/node.log"

# ── Network facts ─────────────────────────────────────────────────────────────
# These mirror ref/qrdx-chain/scripts/testnet.sh: QRDX_CHAIN_ID=9999, node 0's
# REST API on 3007. JSON-RPC is served at /rpc on that same port — the script
# also sets QRDX_RPC_PORT=8545, but the node never binds a standalone listener
# there, so 8545 is not a usable endpoint.
readonly EXPECTED_CHAIN_ID=9999
readonly NODE_PORT=3007
readonly RPC_URL="http://127.0.0.1:${NODE_PORT}/rpc"

# The local chain's genesis prefunds the well-known address for private key 1.
# It is the only account here whose key is public, which is what makes it a
# usable faucet. Never reuse this key anywhere real.
readonly FAUCET_ADDRESS="0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"

readonly STARTUP_TIMEOUT_SEC=120
readonly WATCH_INTERVAL_SEC=15

# ── Output ────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  readonly C_RESET=$'\033[0m' C_RED=$'\033[0;31m' C_GREEN=$'\033[0;32m'
  readonly C_YELLOW=$'\033[0;33m' C_BLUE=$'\033[0;34m' C_DIM=$'\033[2m'
else
  readonly C_RESET='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_DIM=''
fi

info()  { printf '%s\n' "${C_BLUE}==>${C_RESET} $*"; }
ok()    { printf '%s\n' "${C_GREEN}  ok${C_RESET}   $*"; }
warn()  { printf '%s\n' "${C_YELLOW}  warn${C_RESET} $*"; }
fail()  { printf '%s\n' "${C_RED}  FAIL${C_RESET} $*"; }
dim()   { printf '%s\n' "${C_DIM}$*${C_RESET}"; }
die()   { printf '%s\n' "${C_RED}error:${C_RESET} $*" >&2; exit 1; }

# ── Environment ───────────────────────────────────────────────────────────────

# Put the chain's virtualenv ahead of the system Python and make liboqs
# discoverable. testnet.sh shells out to a bare `python3`, so without this it
# silently picks up an interpreter with none of the node's dependencies.
setup_env() {
  export PATH="${VENV}/bin:${PATH}"
  export PYTHONWARNINGS=ignore
  export OQS_FAULTHANDLER=0

  # liboqs-python installs the native library under ~/_oqs by default; a
  # system-wide install works too, so only prepend when it is actually there.
  if [ -d "${HOME}/_oqs/lib" ]; then
    export LD_LIBRARY_PATH="${HOME}/_oqs/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
  fi
}

# ── RPC helpers ───────────────────────────────────────────────────────────────

# Issue a JSON-RPC call. Prints the raw response body; non-zero on transport
# failure. Kept to curl alone so health checks do not depend on the venv.
rpc() {
  local method=$1 params=${2:-[]}
  curl -s -m 10 -X POST "${RPC_URL}" \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}"
}

# Extract the `result` field from a JSON-RPC response without needing jq.
rpc_result() {
  local method=$1 params=${2:-[]} body
  body=$(rpc "${method}" "${params}") || return 1
  [[ "${body}" == *'"result"'* ]] || return 1
  sed -n 's/.*"result"[[:space:]]*:[[:space:]]*"\{0,1\}\([^",}]*\).*/\1/p' <<<"${body}"
}

hex_to_dec() {
  local h=${1#0x}
  [ -n "${h}" ] || { echo 0; return; }
  printf '%d\n' $((16#${h})) 2>/dev/null || echo 0
}

rpc_is_up() { rpc_result eth_chainId >/dev/null 2>&1; }

node_pid() { pgrep -f "run_node.py" | head -1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────

cmd_doctor() {
  local problems=0
  info "Checking prerequisites"

  if [ -d "${CHAIN_DIR}" ]; then
    ok "chain source present at ${CHAIN_DIR}"
  else
    fail "${CHAIN_DIR} is missing — set QRDX_NODE_DIR or check out qrdx-node next to this repo"
    return 1
  fi

  if [ -x "${VENV_PY}" ]; then
    ok "virtualenv present ($(${VENV_PY} --version 2>&1))"
  else
    fail "no virtualenv at ${CHAIN_DIR}/.venv"
    dim "     python3 -m venv ${CHAIN_DIR}/.venv && ${CHAIN_DIR}/.venv/bin/pip install -r ${CHAIN_DIR}/requirements-v3.txt"
    problems=$((problems + 1))
  fi

  if [ -x "${VENV_PY}" ]; then
    # The EVM RPC modules refuse to register without these, and the node then
    # starts but serves no eth_* namespace at all — which looks like a network
    # problem from the wallet rather than a missing dependency.
    if "${VENV_PY}" -c 'import fastapi, aiosqlite, eth_account, rlp' >/dev/null 2>&1; then
      ok "core python dependencies installed"
    else
      fail "python dependencies incomplete (fastapi / aiosqlite / eth_account / rlp)"
      problems=$((problems + 1))
    fi

    if "${VENV_PY}" -c 'import oqs' >/dev/null 2>&1; then
      ok "liboqs bindings importable"
    else
      fail "liboqs (oqs) not importable — the node's PQ identity module needs it"
      dim "     ${VENV}/bin/pip install liboqs-python"
      problems=$((problems + 1))
    fi

    # The QRDX VM fork lives in the vendored py-evm submodule. PyPI's py-evm
    # also provides the `eth` package and will shadow it if both are installed.
    if "${VENV_PY}" -c 'import eth.vm.forks.qrdx' >/dev/null 2>&1; then
      ok "QRDX py-evm fork resolves"
    else
      fail "eth.vm.forks.qrdx not found — the vendored py-evm fork is missing or shadowed"
      dim "     git -C ${CHAIN_DIR} submodule update --init py-evm"
      dim "     ${VENV}/bin/pip uninstall -y py-evm && ${VENV}/bin/pip install --no-deps -e ${CHAIN_DIR}/py-evm"
      problems=$((problems + 1))
    fi
  fi

  command -v jq >/dev/null 2>&1 && ok "jq available" || {
    fail "jq not installed — ref/qrdx-chain/scripts/testnet.sh requires it"
    problems=$((problems + 1))
  }

  command -v curl >/dev/null 2>&1 && ok "curl available" || {
    fail "curl not installed"
    problems=$((problems + 1))
  }

  if [ "${problems}" -eq 0 ]; then
    info "All prerequisites satisfied"
    return 0
  fi
  info "${problems} problem(s) found"
  return 1
}

# ── Lifecycle ─────────────────────────────────────────────────────────────────

cmd_up() {
  setup_env
  cmd_doctor >/dev/null 2>&1 || { cmd_doctor; die "prerequisites not met"; }

  if rpc_is_up; then
    info "Node already running and serving RPC"
    cmd_status
    return $?
  fi

  info "Starting single-node QRDX testnet (chain ${EXPECTED_CHAIN_ID})"
  ( cd "${CHAIN_DIR}" && bash ./scripts/testnet.sh start --nodes 1 --validators 1 ) \
    2>&1 | grep -E "Started node|Chain ID|ERROR|FAIL" || true

  # testnet.sh returns as soon as the process spawns. The node then has to open
  # its database, run genesis, and register the RPC modules, so poll the actual
  # endpoint rather than trusting that exit status.
  info "Waiting for JSON-RPC at ${RPC_URL}"
  local waited=0
  while ! rpc_is_up; do
    if [ "${waited}" -ge "${STARTUP_TIMEOUT_SEC}" ]; then
      fail "RPC did not come up within ${STARTUP_TIMEOUT_SEC}s"
      dim "     last 20 log lines:"
      [ -f "${NODE_LOG}" ] && tail -20 "${NODE_LOG}" | sed 's/^/     /'
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  ok "RPC responding after ${waited}s"

  cmd_status
}

cmd_down() {
  setup_env
  info "Stopping testnet"
  ( cd "${CHAIN_DIR}" && bash ./scripts/testnet.sh stop ) >/dev/null 2>&1
  # testnet.sh tracks a pid file that can go stale across host restarts; make
  # sure nothing is left holding the port.
  pkill -f "run_node.py" 2>/dev/null || true
  sleep 1
  if rpc_is_up; then
    fail "something is still answering on ${RPC_URL}"
    return 1
  fi
  ok "stopped"
}

cmd_restart() { cmd_down; cmd_up; }

# ── Health ────────────────────────────────────────────────────────────────────

# One health pass. Exits non-zero on any failed check so `status` is usable in
# scripts and CI, not just by eye.
run_health_checks() {
  local quiet=${1:-false} problems=0

  local pid; pid=$(node_pid)
  if [ -n "${pid}" ]; then
    [ "${quiet}" = true ] || ok "process running (pid ${pid})"
  else
    [ "${quiet}" = true ] || warn "no run_node.py process found"
  fi

  local chain_hex; chain_hex=$(rpc_result eth_chainId 2>/dev/null)
  if [ -z "${chain_hex}" ]; then
    fail "JSON-RPC not responding at ${RPC_URL}"
    return 1
  fi

  local chain_id; chain_id=$(hex_to_dec "${chain_hex}")
  if [ "${chain_id}" = "${EXPECTED_CHAIN_ID}" ]; then
    [ "${quiet}" = true ] || ok "chain id ${chain_id}"
  else
    # Worth failing loudly: the wallet verifies chain id before signing, and a
    # node reporting an unexpected one will (correctly) block every send.
    fail "chain id is ${chain_id}, expected ${EXPECTED_CHAIN_ID} — the wallet will refuse to sign"
    problems=$((problems + 1))
  fi

  local height; height=$(hex_to_dec "$(rpc_result eth_blockNumber 2>/dev/null)")
  [ "${quiet}" = true ] || ok "block height ${height}"

  local bal_hex; bal_hex=$(rpc_result eth_getBalance "[\"${FAUCET_ADDRESS}\",\"latest\"]" 2>/dev/null)
  if [ -n "${bal_hex}" ] && [ "${bal_hex}" != "0x0" ]; then
    [ "${quiet}" = true ] || ok "faucet funded ($(printf '%s' "${bal_hex}"))"
  else
    warn "faucet ${FAUCET_ADDRESS} has no balance — genesis may not have run"
    problems=$((problems + 1))
  fi

  return $((problems > 0 ? 1 : 0))
}

cmd_status() {
  info "QRDX local chain health"
  dim "    rpc: ${RPC_URL}"
  run_health_checks false
  local rc=$?
  [ "${rc}" -eq 0 ] && info "healthy" || info "unhealthy"
  return "${rc}"
}

# Continuous monitor. Reports block production between polls, so a node that is
# up but wedged (RPC answering, height frozen) is visible — that state otherwise
# looks identical to a healthy chain from the wallet's perspective.
cmd_watch() {
  info "Watching ${RPC_URL} every ${WATCH_INTERVAL_SEC}s — Ctrl-C to stop"
  local last_height=-1 consecutive_stalls=0

  while true; do
    local stamp; stamp=$(date '+%H:%M:%S')

    if ! rpc_is_up; then
      printf '%s %s  RPC down\n' "${stamp}" "${C_RED}✗${C_RESET}"
      consecutive_stalls=0
      last_height=-1
      sleep "${WATCH_INTERVAL_SEC}"
      continue
    fi

    local height; height=$(hex_to_dec "$(rpc_result eth_blockNumber 2>/dev/null)")
    local chain_id; chain_id=$(hex_to_dec "$(rpc_result eth_chainId 2>/dev/null)")

    local note=""
    if [ "${chain_id}" != "${EXPECTED_CHAIN_ID}" ]; then
      note="${C_RED}chain id ${chain_id} != ${EXPECTED_CHAIN_ID}${C_RESET}"
    elif [ "${last_height}" -ge 0 ] && [ "${height}" -eq "${last_height}" ]; then
      consecutive_stalls=$((consecutive_stalls + 1))
      note="${C_YELLOW}no new blocks (${consecutive_stalls} polls)${C_RESET}"
    else
      consecutive_stalls=0
    fi

    printf '%s %s  chain %s  height %s  %s\n' \
      "${stamp}" "${C_GREEN}✓${C_RESET}" "${chain_id}" "${height}" "${note}"

    last_height=${height}
    sleep "${WATCH_INTERVAL_SEC}"
  done
}

cmd_logs() {
  [ -f "${NODE_LOG}" ] || die "no log yet at ${NODE_LOG} — start the node first"
  tail -f "${NODE_LOG}"
}

cmd_fund() {
  local address=${1:-}
  local amount=${2:-10}
  [ -n "${address}" ] || die "usage: $0 fund <0x-address> [amount]"

  setup_env
  rpc_is_up || die "node is not running — start it with: $0 up"

  "${VENV_PY}" "${REPO_ROOT}/tests/e2e/fund_account.py" "${address}" "${amount}"
}

# ── Entry point ───────────────────────────────────────────────────────────────

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

main() {
  local command=${1:-}
  [ $# -gt 0 ] && shift

  case "${command}" in
    up|start)    cmd_up "$@" ;;
    down|stop)   cmd_down "$@" ;;
    restart)     cmd_restart "$@" ;;
    status)      cmd_status "$@" ;;
    watch)       cmd_watch "$@" ;;
    logs)        cmd_logs "$@" ;;
    fund)        cmd_fund "$@" ;;
    doctor)      cmd_doctor "$@" ;;
    ""|help|-h|--help) usage ;;
    *) printf 'unknown command: %s\n\n' "${command}" >&2; usage; exit 1 ;;
  esac
}

main "$@"
