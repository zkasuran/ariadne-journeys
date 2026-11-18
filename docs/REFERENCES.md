<!-- SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0 -->
# Primary references

| Key | Source | Used for |
|---|---|---|
| ASK | [Telegraph Make a Request](https://anjoman.ai/docs/using/engine-ask) | Free-form code generation when an Intent has no input schema |
| PAY | [Telegraph Pay per Request](https://anjoman.ai/docs/using/x402-inference) | Test token, receipt semantics, signal commitment and failure accounting |
| RULES | [Season II rules](https://hackathon.telegraphprotocol.com/rules) | Apps acceptance, scoring, evidence and final deadline |
| MODEL | [Model Economy](https://hackathon.telegraphprotocol.com/missions/model-economy) | Customer workflow and purchased intelligence |
| QJS | [QuickJS Emscripten](https://github.com/justjake/quickjs-emscripten) | Runtime limits, context isolation and handle disposal |
| X402 | [x402 Foundation SDK](https://github.com/x402-foundation/x402) | Standard payment creation and HTTP replay |

Sources were read before implementation. Dependencies are pinned in package-lock.json.
The live node remains the source for current request support and payment offers.
