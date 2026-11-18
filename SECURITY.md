<!-- SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0 -->
# Security model

Ariadne runs a candidate business-rule function against an operator-owned contract.
The candidate is untrusted. The host, contract author and local signer are trusted.

| Threat | Defence | Implementation and check |
|---|---|---|
| Candidate reads host credentials or files | QuickJS WebAssembly, no host callbacks, separate worker with empty environment | `src/sandbox-core.ts`, host-isolation test |
| Candidate changes input or approval rules | Fresh context per case, host-owned expected values, input comparison | Input-mutation and context-isolation tests |
| Infinite loop or allocation exhaustion | Heap and stack ceilings, interrupt handler, worker deadline | Infinite-loop and allocation tests |
| Constant answer passes the showcased case | Full contract plus varied cases, not one displayed order | Constant-answer test and browser walkthrough |
| Secret accidentally sent with source | Source/specification secret-pattern refusal | `src/contract.ts`, secret-shaped input test |
| Quote changes after approval | Exact approved requirement policy, testnet/asset/domain and amount checks | Requote and offer-policy tests |
| Duplicate payment or overspending | Single-use quote, authorization reservation before signing, persistent lock and daily ceiling | Spending and concurrent-writer tests |
| Duplicate receipt counted as a new result | Receipt identity journal | Duplicate-receipt test |
| Receipt binds another task or payer | Exact request, payer, signal commitment and timestamp checks | Request and signal-tampering tests |
| Settlement is unsupported | Settlement-header checks and a separate Sepolia RPC transfer check | `verifyDelivery`; exercised on the recorded paid repair |
| Another website uses the local signer | Loopback bind, Host/Origin checks, JSON-only state-changing requests | Loopback API test |
| Injected text executes in the product | Text nodes and textarea values, strict CSP, no HTML rendering of answers | Production browser gate |

## Spending policy

Only Ethereum Sepolia's documented test USDC is enabled. One payment is capped at
0.02 test USDC and daily authorizations at 0.05. A failed signed request remains
reserved until the operator reconciles it. A quote does not establish payment.

The expected payer defaults to the operator's house address. Another installation
can set `ARIADNE_EXPECTED_PAYER` explicitly. Private keys remain environment values
in the local payment process, never browser inputs or candidate data.

## Evidence boundary

The signal hash commits to the exact request and raw provider answer. It does not
establish semantic correctness. The host contract checks that separately. A transfer
may batch several calls, so receipt hashes identify calls and transaction hashes do not.

## Known limits

- Acceptance is scoped to the supplied contract. It is not a formal proof for all inputs.
- The included merchant is a controlled demo, not a production store or paid customer.
- The public browser demo rechecks a recorded paid answer. It does not make a new purchase.
- RPC verification depends on the stated public Sepolia endpoint. It is not a light client.
- QuickJS is an upstream dependency. Isolation tests do not establish absence of all defects.
- The local host can change its own contract and journal. A malicious host is outside scope.
- Repository-wide edits, external merchant actions and production payments are not supported.

## Release gate and reports

Run `./verify.sh`. CI runs the same gate. Report a reproducible issue through the
repository's private security reporting channel when available. Do not include keys,
private customer data or live authorization headers in a report.
